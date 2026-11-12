import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createServer as createTcpServer } from "node:net";
import { Pool } from "pg";
import { migrate } from "../src/migrate.js";
import { createSignalServer } from "../src/server.js";
import type { Signal } from "../src/contracts.js";

const token = randomBytes(32).toString("hex");
const principal = {
  token,
  tenantId: "test-owner-" + randomBytes(8).toString("hex"),
  origin: { type: "source" as const, id: "calendar" },
};
const consumer = { ...principal, token: randomBytes(32).toString("hex"), origin: { type: "consumer" as const, id: "anthropic" } };
const user = { ...principal, token: randomBytes(32).toString("hex"), origin: { type: "user" as const, id: "owner" } };
const otherTenant = { ...principal, token: randomBytes(32).toString("hex"), tenantId: principal.tenantId + "-other" };
const otherSource = { ...principal, token: randomBytes(32).toString("hex"), origin: { type: "source" as const, id: "other-calendar" } };
const principals = [principal, consumer, user, otherTenant, otherSource];
const schema = "test_" + randomBytes(12).toString("hex");
const databaseOptions = {
  options: `-c search_path=${schema}`,
  connectionString: process.env.TEST_DATABASE_URL ??
    "postgres://pwm_test:local-test-only@127.0.0.1:55432/pwm_test",
};
const pool = new Pool(databaseOptions);
let server: Awaited<ReturnType<typeof startServer>>;
let baseUrl: string;

before(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await migrate(pool);
  server = await startServer(pool);
  baseUrl = server.url;
});

after(async () => {
  await server?.stop();
  await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  await pool.end();
});

function signal(overrides: Partial<Signal> = {}): Signal {
  const id = randomBytes(8).toString("hex");
  return {
    origin: principal.origin,
    fidelity: "raw",
    idempotencyKey: id,
    sourceItem: { id: "event-" + id, revision: "1" },
    content: "Family trip on Saturday.",
    ...overrides,
  };
}

async function startServer(database: Pool) {
  const http = createSignalServer({ pool: database, principals });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", resolve);
  });
  const address = http.address();
  assert(address && typeof address !== "string");
  return {
    url: `http://127.0.0.1:${address.port}`,
    async stop() {
      await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
    },
  };
}

async function independentInstance() {
  const independentPool = new Pool(databaseOptions);
  try {
    const instance = await startServer(independentPool);
    return {
      url: instance.url,
      async stop() {
        try {
          await instance.stop();
        } finally {
          await independentPool.end();
        }
      },
    };
  } catch (error) {
    await independentPool.end();
    throw error;
  }
}

function submit(input: unknown, credential = token, url = baseUrl) {
  return fetch(url + "/v1/signals", {
    method: "POST",
    headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

test("a retry returns the same logical receipt", async () => {
  const input = signal();
  const first = await submit(input);
  const retry = await submit(input);
  assert.equal(first.status, 202);
  assert.equal(retry.status, 202);
  assert.deepEqual(await retry.json(), await first.json());
});

test("an idempotency key cannot overwrite a previously accepted Signal", async () => {
  const input = signal();
  const accepted = await (await submit(input)).json();
  for (const change of [
    { content: "Different content" },
    { fidelity: "summary" },
    { sourceItem: { id: "different-item", revision: "1" } },
    { sourceItem: { ...input.sourceItem, revision: "2" } },
  ]) {
    const conflict = await submit({ ...input, ...change });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { state: "rejected", code: "idempotency_conflict" });
  }
  assert.deepEqual(await (await submit(input)).json(), accepted);
});

test("redelivery of a Source Item revision binds a new key to the original receipt", async () => {
  const input = signal();
  const first = await (await submit(input)).json();
  const alias = { ...input, idempotencyKey: input.idempotencyKey + "-alias" };
  const redelivery = await submit(alias);
  assert.equal(redelivery.status, 202);
  assert.deepEqual(await redelivery.json(), first);
  const aliasConflict = await submit({ ...alias, sourceItem: { id: "unrelated", revision: "1" } });
  assert.equal(aliasConflict.status, 409);
  const revisionConflict = await submit({ ...alias, idempotencyKey: "fresh-key", content: "Changed without revision" });
  assert.equal(revisionConflict.status, 409);
});

test("a Source submits a raw Signal and retrieves only its operational receipt", async () => {
  const response = await fetch(baseUrl + "/v1/signals", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      origin: principal.origin,
      fidelity: "raw",
      idempotencyKey: "first-signal",
      sourceItem: { id: "event-1", revision: "1", cursor: "cursor-1" },
      content: "Family trip on Saturday.",
    }),
  });
  assert.equal(response.status, 202);
  const receipt = await response.json();
  assert.deepEqual(receipt, {
    receiptId: receipt.receiptId,
    state: "accepted",
    origin: { type: "source", id: "calendar" },
    fidelity: "raw",
    sourceItem: { id: "event-1", revision: "1", cursor: "cursor-1" },
    receivedAt: receipt.receivedAt,
  });
  assert.match(receipt.receiptId, /^[0-9a-f-]{36}$/);
  assert(Number.isFinite(Date.parse(receipt.receivedAt)));
  const read = await fetch(baseUrl + "/v1/signal-receipts/" + receipt.receiptId, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), receipt);
});

test("a new revision creates a correlated Signal without rewriting the old receipt", async () => {
  const input = signal();
  const first = await (await submit(input)).json();
  const changed = signal({
    sourceItem: { id: first.sourceItem.id, revision: "2" },
    content: "Family trip moved to Sunday.",
  });
  const response = await submit(changed);
  assert.equal(response.status, 202);
  const second = await response.json();
  assert.notEqual(second.receiptId, first.receiptId);
  assert.deepEqual(second.sourceItem, { id: first.sourceItem.id, revision: "2" });
  assert.deepEqual(await (await submit(input)).json(), first);
  assert.deepEqual(await (await submit(changed)).json(), second);
});

test("cursor changes do not create a new Source Item revision", async () => {
  const input = signal();
  const first = await (await submit(input)).json();
  const redelivery = await submit({
    ...input,
    idempotencyKey: input.idempotencyKey + "-cursor",
    sourceItem: { ...input.sourceItem, cursor: "new-page-position" },
  });
  assert.equal(redelivery.status, 202);
  assert.deepEqual(await redelivery.json(), first);
});

test("without an available revision the caller key distinguishes updates", async () => {
  const input = signal({ sourceItem: { id: "unversioned-item" } });
  const first = await (await submit(input)).json();
  assert.deepEqual(first.sourceItem, { id: "unversioned-item" });
  assert.deepEqual(await (await submit(input)).json(), first);
  const update = await submit({ ...input, idempotencyKey: "unversioned-update", content: "New information" });
  assert.equal(update.status, 202);
  assert.notEqual((await update.json()).receiptId, first.receiptId);
});

test("concurrent deliveries through independent instances produce one logical receipt", async () => {
  const second = await independentInstance();
  try {
    const input = signal();
    const responses = await Promise.all(Array.from({ length: 24 }, (_, i) => submit({
      ...input,
      idempotencyKey: i % 2 ? input.idempotencyKey : input.idempotencyKey + i,
    }, token, i % 3 ? baseUrl : second.url)));
    responses.forEach(response => assert.equal(response.status, 202));
    const receipts = await Promise.all(responses.map(response => response.json()));
    receipts.forEach(receipt => assert.deepEqual(receipt, receipts[0]));
    const keyConflict = await submit({ ...input, idempotencyKey: input.idempotencyKey + "0", content: "Changed" });
    assert.equal(keyConflict.status, 409);
  } finally {
    await second.stop();
  }
});

test("concurrent conflicting submissions cannot overwrite the winning Signal", async () => {
  const second = await independentInstance();
  try {
    const input = signal();
    const competing = { ...input, content: "Different concurrent content" };
    const responses = await Promise.all([submit(input), submit(competing, token, second.url)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [202, 409]);
    const winner = responses[0]!.status === 202 ? input : competing;
    const accepted = await responses.find(response => response.status === 202)!.json();
    assert.deepEqual(await (await submit(winner)).json(), accepted);
  } finally {
    await second.stop();
  }
});

test("receipt and retry bindings survive API instance and connection-pool restart", async () => {
  const input = signal();
  const first = await independentInstance();
  let accepted;
  try {
    accepted = await (await submit(input, token, first.url)).json();
  } finally {
    await first.stop();
  }
  const restarted = await independentInstance();
  try {
    const read = await fetch(restarted.url + "/v1/signal-receipts/" + accepted.receiptId, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), accepted);
    assert.deepEqual(await (await submit(input, token, restarted.url)).json(), accepted);
  } finally {
    await restarted.stop();
  }
});

test("Source, Consumer and user origins preserve all input fidelity levels", async () => {
  for (const identity of [principal, consumer, user]) {
    for (const fidelity of ["raw", "excerpt", "summary"] as const) {
      const input = signal({ origin: identity.origin, fidelity });
      if (identity.origin.type !== "source") delete input.sourceItem;
      const response = await submit(input, identity.token);
      assert.equal(response.status, 202);
      const receipt = await response.json();
      assert.equal(receipt.state, "accepted");
      assert.equal(receipt.fidelity, fidelity);
      assert.deepEqual(receipt.origin, identity.origin);
      assert.equal("sourceItem" in receipt, identity.origin.type === "source");
      assert.equal("content" in receipt, false);
      assert.deepEqual(await (await submit(input, identity.token)).json(), receipt);
    }
  }
});

test("idempotency and receipt lookup are isolated by tenant and origin", async () => {
  const input = signal();
  const first = await (await submit(input)).json();
  for (const identity of [otherTenant, otherSource, consumer, user]) {
    const hidden = await fetch(baseUrl + "/v1/signal-receipts/" + first.receiptId, {
      headers: { authorization: `Bearer ${identity.token}` },
    });
    assert.equal(hidden.status, 404);
    assert.deepEqual(await hidden.json(), { state: "rejected", code: "not_found" });
    const separate = await submit({ ...input, origin: identity.origin }, identity.token);
    assert.equal(separate.status, 202);
    assert.notEqual((await separate.json()).receiptId, first.receiptId);
  }
});

test("a never-issued receipt has the same public not-found response as an inaccessible receipt", async () => {
  const response = await fetch(baseUrl + "/v1/signal-receipts/" + randomUUID(), {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { state: "rejected", code: "not_found" });
});

test("identifier limits count Unicode code points rather than UTF-16 code units", async () => {
  const id = "🌍".repeat(256);
  const response = await submit(signal({ sourceItem: { id, revision: "1" } }));
  assert.equal(response.status, 202);
  assert.deepEqual((await response.json()).sourceItem, { id, revision: "1" });
  const tooLong = await submit(signal({ sourceItem: { id: id + "🌍", revision: "1" } }));
  assert.equal(tooLong.status, 400);
});

test("unauthenticated and forged-origin submissions are rejected without reserving the key", async () => {
  const input = signal();
  for (const credential of ["", "incorrect-token", token.toUpperCase()]) {
    const response = await submit(input, credential);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
    assert.deepEqual(await response.json(), { state: "rejected", code: "unauthorized" });
  }
  const forged = await submit({ ...input, origin: user.origin });
  assert.equal(forged.status, 403);
  assert.deepEqual(await forged.json(), { state: "rejected", code: "origin_mismatch" });
  const accepted = await submit(input);
  assert.equal(accepted.status, 202);
  const receipt = await accepted.json();
  const unauthenticatedRead = await fetch(baseUrl + "/v1/signal-receipts/" + receipt.receiptId);
  assert.equal(unauthenticatedRead.status, 401);
});

test("invalid inputs and attempted semantic writes never become accepted Signals", async () => {
  const input = signal();
  for (const change of [
    { content: "" }, { content: "text\u0000invalid" }, { content: "\ud800" },
    { fidelity: "fact" }, { fidelity: null }, { idempotencyKey: "" },
    { idempotencyKey: "x".repeat(257) }, { sourceItem: undefined },
    { sourceItem: { id: "item", revision: "" } },
    { sourceItem: { id: "item", revision: null } },
    { sourceItem: { id: "item", revision: "1", authority: "trusted" } },
    { tenantId: "victim" }, { state: "committed" },
    { candidateInterpretation: "trust me" }, { modelAssertions: [{ fact: "invented" }] },
  ]) {
    const response = await submit({ ...input, ...change });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { state: "rejected", code: "invalid_signal" });
  }
  assert.equal((await submit(input)).status, 202);
});

test("the HTTP boundary rejects malformed, non-UTF8, non-JSON and oversized requests", async () => {
  for (const body of ["{broken", new Uint8Array([0xff, 0xfe])]) {
    const response = await fetch(baseUrl + "/v1/signals", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body,
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { state: "rejected", code: "invalid_json" });
  }
  const wrongType = await fetch(baseUrl + "/v1/signals", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" }, body: "hello",
  });
  assert.equal(wrongType.status, 415);
  const oversized = await submit(signal({ content: "x".repeat(70 * 1024) }));
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { state: "rejected", code: "payload_too_large" });
  const multibyte = await submit(signal({ content: "🌍".repeat(20 * 1024) }));
  assert.equal(multibyte.status, 413);
  assert.equal((await submit(signal())).status, 202);
});

test("closed-pool misuse is an internal fault, not a retryable storage outage", async () => {
  const unavailablePool = new Pool({ ...databaseOptions, connectionTimeoutMillis: 100 });
  await unavailablePool.end();
  const instance = await startServer(unavailablePool);
  const input = signal();
  try {
    const response = await submit(input, token, instance.url);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { state: "rejected", code: "internal_error" });
    assert.equal((await submit(input)).status, 202);
  } finally {
    await instance.stop();
  }
});

test("deterministic schema faults return a content-blind internal error for reads and writes", async () => {
  const unconfiguredPool = new Pool({ ...databaseOptions, options: `-c search_path=missing_${randomBytes(12).toString("hex")}` });
  const instance = await startServer(unconfiguredPool);
  try {
    const requests = [
      await submit(signal(), token, instance.url),
      await fetch(instance.url + "/v1/signal-receipts/" + randomUUID(), {
        headers: { authorization: `Bearer ${token}` },
      }),
    ];
    for (const response of requests) {
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { state: "rejected", code: "internal_error" });
    }
  } finally {
    await instance.stop();
    await unconfiguredPool.end();
  }
});

test("real storage connection loss remains retryable without exposing driver details", async () => {
  const disconnectingPeer = createTcpServer(socket => socket.destroy());
  await new Promise<void>(resolve => disconnectingPeer.listen(0, "127.0.0.1", resolve));
  const address = disconnectingPeer.address();
  assert(address && typeof address !== "string");
  const url = new URL(databaseOptions.connectionString);
  url.hostname = "127.0.0.1";
  url.port = String(address.port);
  const disconnectedPool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 1000 });
  const instance = await startServer(disconnectedPool);
  try {
    const input = signal();
    const requests = [
      await submit(input, token, instance.url),
      await fetch(instance.url + "/v1/signal-receipts/" + randomUUID(), {
        headers: { authorization: `Bearer ${token}` },
      }),
    ];
    for (const response of requests) {
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { state: "rejected", code: "storage_unavailable" });
    }
    assert.equal((await submit(input)).status, 202);
  } finally {
    await instance.stop();
    await disconnectedPool.end();
    await new Promise<void>((resolve, reject) => disconnectingPeer.close(error => error ? reject(error) : resolve()));
  }
});
