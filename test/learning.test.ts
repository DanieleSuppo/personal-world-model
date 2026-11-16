import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { before, after, test } from "node:test";
import { Pool } from "pg";
import { migrate } from "../src/migrate.js";
import { createSignalServer } from "../src/server.js";
import { createLearningRunner } from "../src/learning.js";
import { parseProcessorConfig, interpretSignal } from "../src/processor.js";
import { evaluateSignal, commitInitialProposal, deferLearning } from "../src/knowledge.js";
import { validateProposal } from "../src/semantic-contracts.js";
import type { Principal, Signal } from "../src/contracts.js";

const schema = "test_" + randomBytes(12).toString("hex");
const databaseOptions = { options: `-c search_path=${schema}`, connectionString: process.env.TEST_DATABASE_URL ?? "postgres://pwm_test:local-test-only@127.0.0.1:55432/pwm_test" };
let pool = new Pool(databaseOptions);
const owner: Principal = { token: randomBytes(32).toString("hex"), tenantId: "learning-owner", origin: { type: "user", id: "owner" } };
const source: Principal = { ...owner, token: randomBytes(32).toString("hex"), origin: { type: "source", id: "chat-export" } };
const consumer: Principal = { ...source, token: randomBytes(32).toString("hex"), origin: { type: "consumer", id: "consumer" } };
const stranger: Principal = { ...owner, tenantId: "other-owner", token: randomBytes(32).toString("hex") };
let api: ReturnType<typeof createSignalServer>, apiUrl: string;
const runners: ReturnType<typeof createLearningRunner>[] = [];
let handle: (input: Signal) => Promise<unknown>;
const calls: string[] = [];
const processorServer = createServer((req, res) => {
  let body = ""; req.on("data", c => { body += c; }); req.on("end", () => {
    const payload = JSON.parse(body); const input = JSON.parse(payload.messages[1].content);
    calls.push(input.content);
    void handle(input).then(result => { res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] })); }, () => { res.statusCode = 500; res.end("synthetic failure"); });
  });
});
let processor: NonNullable<ReturnType<typeof parseProcessorConfig>>;
function proposal(content: string, claim = content) {
  return { observations: [{ description: "Synthetic observation", excerpt: content.slice(0, 100) }], decision: "add", assertions: [
    { claim, classification: "personal_knowledge", originBasis: "imported", support: "Synthetic acquired statement", observationIndexes: [0], validity: {}, applicability: "Synthetic context", sensitivity: "ordinary" },
    { claim: "Hypothesis: " + claim, classification: "high_confidence_hypothesis", originBasis: "inferred", support: "Conservative synthetic interpretation", observationIndexes: [0], validity: { until: "2020-01-01T00:00:00Z" }, applicability: "Past synthetic context", sensitivity: "sensitive" },
  ] };
}
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeout = 6000): Promise<T> {
  const end = Date.now() + timeout;
  while (true) { const value = await read(); if (accept(value)) return value; if (Date.now() > end) throw new Error("acceptance polling timed out"); await new Promise(resolve => setTimeout(resolve, 20)); }
}
async function startApi() {
  api = createSignalServer({ pool, principals: [owner, source, consumer, stranger] });
  await new Promise<void>(resolve => api.listen(0, "127.0.0.1", resolve));
  const address = api.address(); assert(address && typeof address !== "string"); apiUrl = `http://127.0.0.1:${address.port}`;
}
async function stopRunners() { await Promise.all(runners.splice(0).map(r => r.stop())); }
function run(configured = true, p = pool) {
  const runner = createLearningRunner({ pool: p, ...(configured ? { processor } : {}) }); runners.push(runner); runner.start(); return runner;
}
function request(path: string, principal = owner, method = "GET", body?: unknown) {
  return fetch(apiUrl + path, { method, headers: { authorization: "Bearer " + principal.token, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function submit(content: string, principal = source, overrides: Partial<Signal> = {}) {
  const signal: Signal = { content, origin: principal.origin, fidelity: "excerpt", idempotencyKey: randomUUID(), sourceItem: { id: randomUUID(), revision: "1" }, ...overrides };
  const response = await request("/v1/signals", principal, "POST", signal); assert.equal(response.status, 202);
  return { receipt: await response.json(), signal };
}
async function receipt(id: string, principal = source) { return (await request("/v1/signal-receipts/" + id, principal)).json(); }
async function assertions(principal = owner) { const response = await request("/v1/model-assertions?limit=100", principal); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); return (await response.json()).assertions; }
async function retained(id: string) { const response = await request("/v1/signals/" + id); assert.equal(response.status, 200); return response.json(); }
async function requeue(id: string, tenantId = owner.tenantId) {
  // Operator transaction: serialize with completion through the Signal, then test terminal state.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT receipt_id FROM signals WHERE tenant_id=$1 AND receipt_id=$2 FOR UPDATE", [tenantId, id]);
    await client.query(`UPDATE signal_learning_attempts a SET state='pending',reason=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE a.tenant_id=$1 AND a.receipt_id=$2 AND a.state='deferred' AND a.reason<>'processor_not_configured'
      AND NOT EXISTS (SELECT 1 FROM semantic_commits c WHERE c.tenant_id=a.tenant_id AND c.receipt_id=a.receipt_id)`, [tenantId, id]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}
before(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`); await migrate(pool); await startApi();
  await new Promise<void>(resolve => processorServer.listen(0, "127.0.0.1", resolve));
  const address = processorServer.address(); assert(address && typeof address !== "string");
  processor = parseProcessorConfig({ PWM_PROCESSOR_BASE_URL: `http://127.0.0.1:${address.port}/v1`, PWM_PROCESSOR_MODEL: "synthetic-fixture" })!;
});
after(async () => {
  await stopRunners(); processorServer.closeAllConnections(); await new Promise<void>(resolve => processorServer.close(() => resolve()));
  await new Promise<void>(resolve => api.close(() => resolve())); await pool.query(`DROP SCHEMA "${schema}" CASCADE`); await pool.end();
});
test("canonical API accepts without waiting, then exposes distinct classifications, compact lineage and protected acquired text", async () => {
  const held = gate(); let entered = false;
  handle = async input => { entered = true; await held.promise; return proposal(input.content); };
  run();
  const { receipt: accepted, signal } = await submit("Synthetic user cycles to work.");
  await until(async () => entered, Boolean);
  assert.equal((await receipt(accepted.receiptId)).state, "accepted");
  assert.equal((await assertions()).length, 0);
  held.release();
  const committed = await until(() => receipt(accepted.receiptId), r => r.state === "committed");
  assert.deepEqual(Object.keys(committed).sort(), Object.keys(accepted).sort());
  const view = await assertions(); assert.equal(view.length, 2);
  assert.deepEqual(new Set(view.map((a: any) => a.classification)), new Set(["personal_knowledge", "high_confidence_hypothesis"]));
  for (const assertion of view) {
    assert.equal(assertion.revision, 1); assert.equal(assertion.observations[0].receiptId, accepted.receiptId);
    assert.deepEqual(assertion.observations[0].sourceItem, signal.sourceItem); assert.equal(assertion.observations[0].fidelity, "excerpt");
    assert.equal(assertion.tenantId, undefined); assert.equal(assertion.content, undefined);
  }
  assert.equal((await retained(accepted.receiptId)).content, signal.content);
  assert.deepEqual((await retained(accepted.receiptId)).retention, { state: "pending" });
  await stopRunners();
  const count = calls.length;
  await new Promise<void>(resolve => api.close(() => resolve())); await pool.end(); pool = new Pool(databaseOptions); await startApi();
  run();
  assert.deepEqual(await assertions(), view);
  assert.equal((await submit(signal.content, source, signal)).receipt.receiptId, accepted.receiptId);
  assert.equal((await submit(signal.content, source, { ...signal, idempotencyKey: randomUUID() })).receipt.receiptId, accepted.receiptId);
  await new Promise(resolve => setTimeout(resolve, 300)); assert.equal(calls.length, count); await stopRunners();
});
test("inspection is owner-only, tenant-scoped, bounded and strict Signal intake still rejects semantic writes", async () => {
  for (const p of [source, consumer]) assert.equal((await request("/v1/model-assertions", p)).status, 404);
  assert.deepEqual(await assertions(stranger), []);
  assert.equal((await request("/v1/model-assertions", { ...owner, token: "bad" })).status, 401);
  for (const query of ["limit=0", "limit=101", "limit=1.5", "limit=-1", "limit=", "limit=1&limit=2", "tenantId=other", "limit=1e1"]) assert.equal((await request("/v1/model-assertions?" + query)).status, 400, query);
  assert.equal((await (await request("/v1/model-assertions?limit=1")).json()).assertions.length, 1);
  const response = await request("/v1/signals", source, "POST", { content: "fixture", origin: source.origin, fidelity: "raw", idempotencyKey: randomUUID(), sourceItem: { id: "fixture" }, assertions: [] });
  assert.equal(response.status, 400);
});
test("two independent workers on the same Signal commit one evidence set", async () => {
  const secondPool = new Pool(databaseOptions); const held = gate(); let entered = 0;
  handle = async input => { entered++; await held.promise; return proposal(input.content); };
  const { receipt: accepted } = await submit("Same-Signal worker race."); const before = (await assertions()).length;
  try {
    run(); run(true, secondPool); await until(async () => entered, n => n === 2); held.release();
    await until(() => receipt(accepted.receiptId), r => r.state === "committed"); await stopRunners();
    assert.equal((await assertions()).length, before + 2);
    const view = (await assertions()).filter((a: any) => a.observations[0].receiptId === accepted.receiptId);
    assert.equal(new Set(view.map((a: any) => a.observations[0].id)).size, 1);
  } finally { held.release(); await stopRunners(); await secondPool.end(); }
});
test("different Signals evaluated at one version require fresh interpretation, never silently merge stale proposals", async () => {
  const secondPool = new Pool(databaseOptions); const held = gate(); let entered = false;
  const a = await submit("Different-Signal race A."); const b = await submit("Different-Signal race B.");
  const counts = new Map<string, number>();
  handle = async input => {
    const n = (counts.get(input.content) ?? 0) + 1; counts.set(input.content, n);
    if (input.content === a.signal.content && n === 1) { entered = true; await held.promise; }
    return proposal(input.content, n === 1 ? "first: " + input.content : "fresh: " + input.content);
  };
  try {
    run(); await until(async () => entered, Boolean);
    // Independent engine instance interprets B at the same tenant version while runner holds A.
    const input = (await evaluateSignal(secondPool, owner.tenantId, b.receipt.receiptId, processor.fingerprint))!;
    const output = validateProposal(await interpretSignal(input, processor), input);
    assert.equal((await commitInitialProposal(secondPool, input, output)).status, "committed");
    held.release();
    await until(() => receipt(a.receipt.receiptId), r => r.state === "committed"); await stopRunners();
    const view = await assertions();
    assert.equal(counts.get(a.signal.content), 2);
    assert.equal(counts.get(b.signal.content), 1);
    assert(!view.some((x: any) => x.claim === "first: " + a.signal.content));
    assert(view.some((x: any) => x.claim === "fresh: " + a.signal.content));
    assert(view.some((x: any) => x.claim === "first: " + b.signal.content));
  } finally { held.release(); await stopRunners(); await secondPool.end(); }
});
test("missing config visibly defers, restart preserves content, configured startup resumes and no-change remains terminal", async () => {
  const { receipt: accepted, signal } = await submit("No meaningful synthetic change."); run(false);
  await until(() => receipt(accepted.receiptId), r => r.state === "deferred"); await stopRunners();
  assert.equal((await retained(accepted.receiptId)).content, signal.content);
  handle = async input => ({ observations: proposal(input.content).observations, decision: "no_meaningful_change", assertions: [] });
  const count = (await assertions()).length; run();
  await until(() => receipt(accepted.receiptId), r => r.state === "no meaningful change"); await stopRunners();
  assert.equal((await assertions()).length, count);
  const requests = calls.length; run(); await new Promise(resolve => setTimeout(resolve, 300)); await stopRunners(); assert.equal(calls.length, requests);
});
test("processor errors and invalid output stay deferred across scans/restart until explicit tenant-scoped requeue", async () => {
  for (const malformed of [false, true]) {
    const { receipt: accepted, signal } = await submit("Failed synthetic input " + malformed);
    handle = async () => { if (!malformed) throw new Error("synthetic"); return { ...proposal(signal.content), tenantId: "forged" }; };
    const initial = calls.length; run(); await until(() => receipt(accepted.receiptId), r => r.state === "deferred");
    await new Promise(resolve => setTimeout(resolve, 300)); await stopRunners(); run(); await new Promise(resolve => setTimeout(resolve, 300)); await stopRunners();
    assert.equal(calls.length, initial + 1); assert.equal((await retained(accepted.receiptId)).content, signal.content);
    await requeue(accepted.receiptId, stranger.tenantId); run(); await new Promise(resolve => setTimeout(resolve, 300)); await stopRunners(); assert.equal(calls.length, initial + 1);
    handle = async input => proposal(input.content); await requeue(accepted.receiptId); run();
    await until(() => receipt(accepted.receiptId), r => r.state === "committed"); await stopRunners(); assert.equal(calls.length, initial + 2);
    await requeue(accepted.receiptId); assert.equal((await receipt(accepted.receiptId)).state, "committed");
  }
});
test("privacy deletion before held response prevents learning; deletion after commit retains semantic records", async () => {
  const held = gate(); let entered = false;
  const { receipt: accepted } = await submit("Deleted synthetic acquired content.");
  const before = (await assertions()).length;
  handle = async input => { entered = true; await held.promise; return proposal(input.content); }; run();
  await until(async () => entered, Boolean);
  assert.equal((await request("/v1/signals/" + accepted.receiptId, owner, "DELETE")).status, 200); held.release();
  await until(() => receipt(accepted.receiptId), r => r.state === "deferred"); await stopRunners();
  assert.equal((await assertions()).length, before); assert.equal((await retained(accepted.receiptId)).content, null);
  handle = async input => proposal(input.content); const live = await submit("Learn then delete synthetic content."); run();
  await until(() => receipt(live.receipt.receiptId), r => r.state === "committed"); await stopRunners();
  const view = await assertions(); await request("/v1/signals/" + live.receipt.receiptId, owner, "DELETE");
  assert.deepEqual(await assertions(), view); assert.equal((await retained(live.receipt.receiptId)).content, null);
});
test("backend termination rolls back the whole commit and explicit recovery yields one canonical result", async () => {
  const { receipt: accepted, signal } = await submit("Synthetic interrupted commit.");
  const input = (await evaluateSignal(pool, owner.tenantId, accepted.receiptId, processor.fingerprint))!;
  const before = await assertions();
  const barrier = randomBytes(3).readUIntBE(0, 3) + 100000;
  const blocker = await pool.connect();
  await blocker.query("SELECT pg_advisory_lock($1)", [barrier]);
  await pool.query(`CREATE FUNCTION hold_assertion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(${barrier}); RETURN NEW; END $$;
    CREATE TRIGGER hold_assertion BEFORE INSERT ON model_assertions FOR EACH ROW EXECUTE FUNCTION hold_assertion()`);
  handle = async i => proposal(i.content);
  try {
    run();
    const waiting = await until(async () => (await pool.query<{ pid: number }>("SELECT pid FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND NOT granted", [barrier])).rows, rows => rows.length === 1);
    assert.equal((await pool.query("SELECT pg_terminate_backend($1) AS terminated", [waiting[0]!.pid])).rows[0].terminated, true);
    await until(() => receipt(accepted.receiptId), r => r.state === "deferred"); await stopRunners();
    assert.deepEqual(await assertions(), before);
    assert.equal((await retained(accepted.receiptId)).content, signal.content);
    assert.equal((await evaluateSignal(pool, owner.tenantId, accepted.receiptId))!.stateVersion, input.stateVersion);
  } finally {
    await blocker.query("SELECT pg_advisory_unlock($1)", [barrier]); blocker.release(); await stopRunners();
    await pool.query("DROP TRIGGER hold_assertion ON model_assertions; DROP FUNCTION hold_assertion()");
  }
  await requeue(accepted.receiptId); run(); await until(() => receipt(accepted.receiptId), r => r.state === "committed"); await stopRunners();
  const view = await assertions(); assert.equal(view.length, before.length + 2);
  // Simulate a lost commit response using the original evaluated input, now stale.
  const replay = await commitInitialProposal(pool, input, validateProposal(proposal(signal.content), input));
  assert.equal(replay.status, "committed"); assert.deepEqual(await assertions(), view);
});
test("operator requeue waiting behind a completing transaction cannot replace terminal processing", async () => {
  const { receipt: accepted } = await submit("Synthetic completion and requeue race.");
  await deferLearning(pool, owner.tenantId, accepted.receiptId, processor.fingerprint, "processor_failed");
  await requeue(accepted.receiptId);
  const barrier = randomBytes(3).readUIntBE(0, 3) + 100000;
  const blocker = await pool.connect(); await blocker.query("SELECT pg_advisory_lock($1)", [barrier]);
  await pool.query(`CREATE FUNCTION hold_requeue_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(${barrier}); RETURN NEW; END $$;
    CREATE TRIGGER hold_requeue_commit BEFORE INSERT ON model_assertions FOR EACH ROW EXECUTE FUNCTION hold_requeue_commit()`);
  handle = async input => proposal(input.content);
  let queued: Promise<void> | undefined;
  try {
    run();
    await until(async () => (await pool.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND NOT granted", [barrier])).rows, rows => rows.length === 1);
    queued = requeue(accepted.receiptId);
    await until(async () => (await pool.query("SELECT pid FROM pg_stat_activity WHERE wait_event='transactionid' AND query LIKE 'SELECT receipt_id FROM signals WHERE tenant_id=%'")).rows, rows => rows.length >= 1);
    await blocker.query("SELECT pg_advisory_unlock($1)", [barrier]);
    await queued;
    await until(() => receipt(accepted.receiptId), r => r.state === "committed"); await stopRunners();
    assert.equal((await pool.query("SELECT state FROM signal_learning_attempts WHERE tenant_id=$1 AND receipt_id=$2", [owner.tenantId, accepted.receiptId])).rows[0].state, "completed");
  } finally {
    await blocker.query("SELECT pg_advisory_unlock($1)", [barrier]); blocker.release(); await queued; await stopRunners();
    await pool.query("DROP TRIGGER hold_requeue_commit ON model_assertions; DROP FUNCTION hold_requeue_commit()");
  }
});
test("three stale evaluations defer rather than merging and shutdown abort leaves work resumable", async () => {
  const target = await submit("Synthetic bounded contention."); let attempts = 0;
  handle = async input => {
    assert.equal(input.content, target.signal.content); attempts++;
    const concurrent = await submit("Concurrent semantic change " + attempts);
    const evaluation = (await evaluateSignal(pool, owner.tenantId, concurrent.receipt.receiptId))!;
    await commitInitialProposal(pool, evaluation, validateProposal(proposal(concurrent.signal.content), evaluation));
    return proposal(input.content, "stale contender");
  };
  run(); await until(() => receipt(target.receipt.receiptId), r => r.state === "deferred"); await stopRunners();
  assert.equal(attempts, 3); assert(!(await assertions()).some((a: any) => a.claim === "stale contender"));
  run(); await new Promise(resolve => setTimeout(resolve, 300)); await stopRunners(); assert.equal(attempts, 3);
  const pending = await submit("Synthetic stop during HTTP."); let entered = false; const held = gate();
  handle = async input => { entered = true; await held.promise; return proposal(input.content); };
  run(); await until(async () => entered, Boolean); await stopRunners();
  assert.equal((await receipt(pending.receipt.receiptId)).state, "accepted"); held.release();
  handle = async input => proposal(input.content); run(); await until(() => receipt(pending.receipt.receiptId), r => r.state === "committed"); await stopRunners();
});
test("slow failed/unconfigured workers and failed-work requeue cannot overwrite durable completion", async () => {
  const secondPool = new Pool(databaseOptions); const held = gate(); let entered = 0;
  const { receipt: accepted, signal } = await submit("Slow failure races durable success.");
  handle = async input => { entered++; if (entered === 1) { await held.promise; throw new Error("synthetic"); } return proposal(input.content); };
  try {
    run(); await until(async () => entered, n => n === 1); run(true, secondPool);
    await until(() => receipt(accepted.receiptId), r => r.state === "committed"); held.release(); await stopRunners();
    await Promise.all([deferLearning(pool, owner.tenantId, accepted.receiptId, "none", "processor_not_configured"), requeue(accepted.receiptId)]);
    assert.equal((await receipt(accepted.receiptId)).state, "committed");
    const input = (await evaluateSignal(pool, owner.tenantId, accepted.receiptId, processor.fingerprint))!;
    const replay = await commitInitialProposal(pool, input, validateProposal(proposal(signal.content), input));
    assert.equal(replay.status, "committed");
  } finally { held.release(); await stopRunners(); await secondPool.end(); }
});
