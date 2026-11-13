import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { migrate } from "../src/migrate.js";
import { createSignalServer } from "../src/server.js";
import type { Principal, Signal } from "../src/contracts.js";

const owner: Principal = {
  token: randomBytes(32).toString("hex"), tenantId: "retention-owner",
  origin: { type: "user", id: "owner" },
};
const source: Principal = {
  ...owner, token: randomBytes(32).toString("hex"), origin: { type: "source", id: "chat-export" },
};
const consumer: Principal = {
  ...owner, token: randomBytes(32).toString("hex"), origin: { type: "consumer", id: "assistant" },
};
const stranger: Principal = { ...owner, token: randomBytes(32).toString("hex"), tenantId: "other-owner" };
const schema = "test_" + randomBytes(12).toString("hex");
const databaseOptions = {
  options: `-c search_path=${schema}`,
  connectionString: process.env.TEST_DATABASE_URL ??
    "postgres://pwm_test:local-test-only@127.0.0.1:55432/pwm_test",
};
let pool = new Pool(databaseOptions);
let server: ReturnType<typeof createSignalServer>;
let url: string;

async function start() {
  server = createSignalServer({ pool, principals: [owner, source, consumer, stranger] });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
}
async function stop() {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
}
async function restart() {
  await stop();
  pool = new Pool(databaseOptions);
  await start();
}
function input(overrides: Partial<Signal> = {}): Signal {
  return {
    origin: source.origin, fidelity: "raw", content: "User: Acquired text only.\nAssistant: Understood. 🧭",
    idempotencyKey: randomUUID(), sourceItem: { id: randomUUID(), revision: "1" }, ...overrides,
  };
}
function request(path: string, method = "GET", principal = owner, body?: unknown) {
  return fetch(url + path, {
    method, headers: { authorization: `Bearer ${principal.token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function submit(signal: Signal) {
  const result = await request("/v1/signals", "POST", source, signal);
  assert.equal(result.status, 202);
  return result.json();
}
async function retained(id: string) {
  const result = await request("/v1/signals/" + id);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  return result.json();
}

before(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await migrate(pool);
  await start();
});
after(async () => {
  await new Promise<void>((resolve, reject) => server?.close(error => error ? reject(error) : resolve()));
  await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  await pool.end();
});

test("only a user in the same tenant can recover or explicitly delete acquired content", async () => {
  const signal = input();
  const receipt = await submit(signal);
  const path = "/v1/signals/" + receipt.receiptId;
  for (const method of ["GET", "DELETE"]) {
    for (const principal of [source, consumer, stranger]) {
      const denied = await request(path, method, principal);
      assert.equal(denied.status, 404);
      assert.deepEqual(await denied.json(), { state: "rejected", code: "not_found" });
    }
    assert.equal((await request("/v1/signals/" + randomUUID(), method)).status, 404);
    assert.equal((await request(path, method, { ...owner, token: "invalid" })).status, 401);
  }
  assert.equal((await retained(receipt.receiptId)).content, signal.content);
  const operational = await request("/v1/signal-receipts/" + receipt.receiptId, "GET", source);
  assert.deepEqual(await operational.json(), receipt);
});

test("concurrent deletion, retry and new revision never resurrect or lose acquired material", async () => {
  const signal = input();
  const receipt = await submit(signal);
  const newer = input({ sourceItem: { id: signal.sourceItem!.id, revision: "2" }, content: "Later acquired text" });
  const [deletion, retry, next] = await Promise.all([
    request("/v1/signals/" + receipt.receiptId, "DELETE"),
    submit({ ...signal, idempotencyKey: randomUUID() }),
    submit(newer),
  ]);
  assert.equal(deletion.status, 200);
  assert.deepEqual(retry, receipt);
  await restart();
  assert.equal((await retained(receipt.receiptId)).content, null);
  assert.deepEqual(await retained(next.receiptId), {
    receipt: next, content: newer.content, retention: { state: "pending" },
  });
});

test("interrupted privacy deletion rolls back, while a committed privacy policy removes content only", async () => {
  const signal = input();
  const receipt = await submit(signal);
  const sql = `UPDATE signals SET content = NULL, content_deleted_at = CURRENT_TIMESTAMP,
    content_deletion_reason = 'privacy_policy' WHERE receipt_id = $1`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql, [receipt.receiptId]);
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  assert.equal((await retained(receipt.receiptId)).content, signal.content);
  await pool.query(sql, [receipt.receiptId]);
  const deleted = await retained(receipt.receiptId);
  assert.equal(deleted.content, null);
  assert.equal(deleted.retention.reason, "privacy_policy");
  assert.equal(deleted.retention.state, "deleted");
  assert.deepEqual(deleted.receipt, receipt);
  await assert.rejects(pool.query("UPDATE signals SET content = $1 WHERE receipt_id = $2", [signal.content, receipt.receiptId]), { code: "23514" });
  await assert.rejects(pool.query("UPDATE signals SET content_sha256 = sha256('spoof') WHERE receipt_id = $1", [receipt.receiptId]), { code: "23514" });
  await assert.rejects(pool.query("UPDATE signals SET fidelity = 'summary' WHERE receipt_id = $1", [receipt.receiptId]), { code: "23514" });
  assert.deepEqual(await submit(signal), receipt);
  assert.deepEqual(await retained(receipt.receiptId), deleted);
});

test("explicit user deletion survives restart and duplicate delivery without claiming consolidation", async () => {
  const signal = input();
  const receipt = await submit(signal);
  const path = "/v1/signals/" + receipt.receiptId;
  const deletion = await request(path, "DELETE");
  assert.equal(deletion.status, 200);
  const deleted = await deletion.json();
  assert.deepEqual(deleted, {
    receipt, content: null,
    retention: { state: "deleted", reason: "user_request", deletedAt: deleted.retention.deletedAt },
  });
  assert(Number.isFinite(Date.parse(deleted.retention.deletedAt)));
  await restart();
  assert.deepEqual(await (await request(path, "DELETE")).json(), deleted);
  assert.deepEqual(await submit(signal), receipt);
  const alias = { ...signal, idempotencyKey: randomUUID() };
  assert.deepEqual(await submit(alias), receipt);
  const conflict = await request("/v1/signals", "POST", source, { ...alias, content: "Changed text" });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await retained(receipt.receiptId), deleted);
  const newer = input({ sourceItem: { id: signal.sourceItem!.id, revision: "2" }, content: "New acquired revision" });
  const nextReceipt = await submit(newer);
  assert.deepEqual(await retained(nextReceipt.receiptId), {
    receipt: nextReceipt, content: newer.content, retention: { state: "pending" },
  });
});

test("ordinary processing cannot replace or delete pending content, even with a committed receipt", async () => {
  const signal = input();
  const receipt = await submit(signal);
  await pool.query("UPDATE signals SET state = 'committed' WHERE receipt_id = $1", [receipt.receiptId]);
  for (const sql of [
    "UPDATE signals SET content = 'Unacquired replacement' WHERE receipt_id = $1",
    "UPDATE signals SET content = NULL WHERE receipt_id = $1",
    "DELETE FROM signals WHERE receipt_id = $1",
  ]) {
    await assert.rejects(pool.query(sql, [receipt.receiptId]), { code: "23514" });
  }
  await assert.rejects(pool.query("TRUNCATE signals CASCADE"), { code: "23514" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE signals SET state = 'reassessing' WHERE receipt_id = $1", [receipt.receiptId]);
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  await restart();
  assert.deepEqual(await retained(receipt.receiptId), {
    receipt: { ...receipt, state: "committed" }, content: signal.content, retention: { state: "pending" },
  });
});

test("documented privacy sweep preserves tombstones and safely retries mixed pending/deleted content", async () => {
  const pendingSignal = input();
  const pending = await submit(pendingSignal);
  const alreadyDeleted = await submit(input());
  const deletion = await request("/v1/signals/" + alreadyDeleted.receiptId, "DELETE");
  assert.equal(deletion.status, 200);
  const tombstone = await deletion.json();
  const externalInput = input({ origin: stranger.origin });
  const externalResponse = await request("/v1/signals", "POST", stranger, externalInput);
  assert.equal(externalResponse.status, 202);
  const external = await externalResponse.json();
  const documentation = await readFile(new URL("../docs/development.md", import.meta.url), "utf8");
  const statement = documentation.match(/\x60\x60\x60sql\n([\s\S]*?)\n\x60\x60\x60/);
  assert(statement?.[1], "privacy-policy operator statement must be documented");
  await pool.query(statement[1], [owner.tenantId]);
  const cleared = await retained(pending.receiptId);
  assert.equal(cleared.content, null);
  assert.equal(cleared.retention.reason, "privacy_policy");
  assert.deepEqual(cleared.receipt, pending);
  assert.deepEqual(await retained(alreadyDeleted.receiptId), tombstone);
  await pool.query(statement[1], [owner.tenantId]);
  assert.deepEqual(await retained(pending.receiptId), cleared);
  const externalRead = await request("/v1/signals/" + external.receiptId, "GET", stranger);
  assert.equal(externalRead.status, 200);
  assert.equal((await externalRead.json()).content, externalInput.content);
});

test("additive migration preserves legacy content, receipts and retry keys", async () => {
  const legacySchema = "test_" + randomBytes(12).toString("hex");
  const legacyPool = new Pool({ ...databaseOptions, options: `-c search_path=${legacySchema}` });
  const http = createSignalServer({ pool: legacyPool, principals: [owner, source] });
  try {
    await legacyPool.query(`CREATE SCHEMA "${legacySchema}"`);
    await legacyPool.query("CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    for (const name of ["001_signals.sql", "002_signal_keys.sql", "003_source_revisions.sql"]) {
      await legacyPool.query(await readFile(new URL("../migrations/" + name, import.meta.url), "utf8"));
      await legacyPool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    }
    const signal = input({ fidelity: "excerpt", content: "Only this legacy excerpt was acquired. 🧭" });
    const id = randomUUID();
    await legacyPool.query(`INSERT INTO signals
      (receipt_id, tenant_id, origin_type, origin_id, fidelity, content, source_item_id, source_revision)
      VALUES ($1,$2,'source',$3,$4,$5,$6,$7)`,
    [id, source.tenantId, source.origin.id, signal.fidelity, signal.content, signal.sourceItem!.id, "1"]);
    await legacyPool.query(`INSERT INTO signal_keys VALUES ($1,'source',$2,$3,$4)`,
      [source.tenantId, source.origin.id, signal.idempotencyKey, id]);
    await migrate(legacyPool);
    await migrate(legacyPool);
    await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    assert(address && typeof address !== "string");
    const endpoint = `http://127.0.0.1:${address.port}`;
    const read = await fetch(endpoint + "/v1/signals/" + id, { headers: { authorization: `Bearer ${owner.token}` } });
    assert.equal(read.status, 200);
    const recovered = await read.json();
    assert.equal(recovered.content, signal.content);
    assert.equal(recovered.receipt.fidelity, "excerpt");
    assert.deepEqual(recovered.retention, { state: "pending" });
    const retry = await fetch(endpoint + "/v1/signals", {
      method: "POST", headers: { authorization: `Bearer ${source.token}`, "content-type": "application/json" },
      body: JSON.stringify(signal),
    });
    assert.equal(retry.status, 202);
    assert.deepEqual(await retry.json(), recovered.receipt);
  } finally {
    if (http.listening) await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
    await legacyPool.query(`DROP SCHEMA IF EXISTS "${legacySchema}" CASCADE`);
    await legacyPool.end();
  }
});

test("acquired content and fidelity survive redelivery and independent API/pool restart", async () => {
  for (const fidelity of ["raw", "excerpt", "summary"] as const) {
    const signal = input({ fidelity });
    const receipt = await submit(signal);
    assert.deepEqual(await submit({ ...signal, idempotencyKey: randomUUID() }), receipt);
    await restart();
    assert.deepEqual(await retained(receipt.receiptId), {
      receipt, content: signal.content, retention: { state: "pending" },
    });
  }
});
