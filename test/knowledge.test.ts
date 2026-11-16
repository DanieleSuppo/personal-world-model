import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { migrate } from "../src/migrate.js";
import { submitSignal, getRetainedSignal, deleteSignalContent } from "../src/signals.js";
import { evaluateSignal, commitInitialProposal, getCurrentAssertions } from "../src/knowledge.js";
import { validateProposal } from "../src/semantic-contracts.js";
import type { Principal } from "../src/contracts.js";

const schema = "test_" + randomBytes(12).toString("hex");
const pool = new Pool({ options: `-c search_path=${schema}`, connectionString: process.env.TEST_DATABASE_URL ?? "postgres://pwm_test:local-test-only@127.0.0.1:55432/pwm_test" });
const owner: Principal = { token: "a".repeat(64), tenantId: "knowledge-owner", origin: { type: "user", id: "owner" } };
before(async () => { await pool.query(`CREATE SCHEMA "${schema}"`); await migrate(pool); });
after(async () => { await pool.query(`DROP SCHEMA "${schema}" CASCADE`); await pool.end(); });
async function acquire(tenantId = randomUUID()) {
  const principal = { ...owner, tenantId };
  const receipt = await submitSignal(pool, principal, { origin: principal.origin, fidelity: "excerpt", content: "I cycle to work. I may enjoy cycling holidays.", idempotencyKey: randomUUID(), sourceItem: { id: "diary", revision: randomUUID() } });
  const input = await evaluateSignal(pool, tenantId, receipt.receiptId);
  assert(input);
  return { principal, receipt, input };
}
function proposal() {
  return { observations: [{ description: "Cycling commute", excerpt: "I cycle to work." }], decision: "add", assertions: [
    { claim: "Cycles to work", classification: "personal_knowledge", originBasis: "user_stated", support: "Explicit statement", observationIndexes: [0], validity: { from: "2020-01-01T00:00:00Z", until: "2021-01-01T00:00:00Z" }, applicability: "Work journeys", sensitivity: "ordinary", semanticAnchors: [{ kind: "activity", label: "cycling" }] },
    { claim: "May enjoy cycling holidays", classification: "high_confidence_hypothesis", originBasis: "inferred", support: "Expressed possibility", observationIndexes: [0], validity: {}, applicability: "Holiday planning", sensitivity: "sensitive" },
  ] };
}
test("add atomically exposes distinct current classifications and compact immutable evidence without releasing raw retention", async () => {
  const { principal, receipt, input } = await acquire();
  const result = await commitInitialProposal(pool, input, validateProposal(proposal(), input));
  assert.equal(result.status, "committed");
  const view = await getCurrentAssertions(pool, principal, 100);
  assert(view);
  assert.equal(view.assertions.length, 2);
  const known = view.assertions.find(a => a.classification === "personal_knowledge")!;
  assert.equal(known.claim, "Cycles to work");
  assert.deepEqual(known.validity, { from: "2020-01-01T00:00:00Z", until: "2021-01-01T00:00:00Z" });
  assert.equal(known.applicability, "Work journeys");
  assert.equal(known.revision, 1);
  assert.equal(known.observations[0]!.receiptId, receipt.receiptId);
  assert.equal(known.observations[0]!.fidelity, "excerpt");
  assert.equal(known.observations[0]!.sourceItem!.id, "diary");
  assert.equal((await getRetainedSignal(pool, principal, receipt.receiptId))!.retention.state, "pending");
  assert.equal(await getCurrentAssertions(pool, { ...principal, origin: { type: "consumer", id: "c" } }, 10), undefined);
  assert.deepEqual(await getCurrentAssertions(pool, owner, 10), { assertions: [] });
});
test("replay precedes stale gate, conflicts on changed proposal and never duplicates evidence", async () => {
  const first = await acquire();
  const raw = proposal();
  const committed = await commitInitialProposal(pool, first.input, validateProposal(raw, first.input));
  const second = await acquire(first.principal.tenantId);
  await commitInitialProposal(pool, second.input, validateProposal(proposal(), second.input));
  assert.deepEqual(await commitInitialProposal(pool, first.input, validateProposal(raw, first.input)), committed);
  raw.assertions[0]!.claim = "Changed interpretation";
  await assert.rejects(commitInitialProposal(pool, first.input, validateProposal(raw, first.input)), /proposal_conflict/);
  const otherPolicy = await evaluateSignal(pool, first.principal.tenantId, first.receipt.receiptId, "different-policy");
  assert(otherPolicy);
  assert.deepEqual(await commitInitialProposal(pool, otherPolicy, validateProposal(raw, otherPolicy)), committed);
  assert.equal((await getCurrentAssertions(pool, first.principal, 100))!.assertions.length, 4);
});
test("stale input creates no partial records, no-change is terminal without incrementing semantic state", async () => {
  const first = await acquire(); const second = await acquire(first.principal.tenantId);
  await commitInitialProposal(pool, first.input, validateProposal(proposal(), first.input));
  assert.equal((await commitInitialProposal(pool, second.input, validateProposal(proposal(), second.input))).status, "stale");
  assert.equal((await getRetainedSignal(pool, second.principal, second.receipt.receiptId))!.receipt.state, "accepted");
  const fresh = (await evaluateSignal(pool, second.principal.tenantId, second.receipt.receiptId))!;
  const noChange = validateProposal({ observations: proposal().observations, decision: "no_meaningful_change", assertions: [] }, fresh);
  const done = await commitInitialProposal(pool, fresh, noChange);
  assert.equal(done.status, "no_meaningful_change");
  assert.deepEqual(await commitInitialProposal(pool, fresh, noChange), done);
  const after = (await evaluateSignal(pool, first.principal.tenantId, first.receipt.receiptId))!;
  assert.equal(after.stateVersion, fresh.stateVersion);
});
test("engine rejects untrusted fields, fabricated evidence, invalid dates/indexes and imported user authority", async () => {
  const { input } = await acquire();
  const cases = [
    { ...proposal(), tenantId: "forged" }, { ...proposal(), decision: "delete" },
    { ...proposal(), observations: [{ description: "Forged", excerpt: "never acquired" }] },
    { ...proposal(), assertions: [] },
    { ...proposal(), assertions: [{ ...proposal().assertions[0], observationIndexes: [1] }] },
    { ...proposal(), assertions: [{ ...proposal().assertions[0], observationIndexes: [0, 0] }] },
    { ...proposal(), assertions: [{ ...proposal().assertions[0], validity: { from: "2021-01-01T00:00:00Z", until: "2020-01-01T00:00:00Z" } }] },
    { ...proposal(), assertions: [{ ...proposal().assertions[0], claim: "\ud800" }] },
  ];
  for (const raw of cases) assert.throws(() => validateProposal(raw, input), /invalid_proposal/);
  assert.throws(() => validateProposal(proposal(), { ...input, origin: { type: "source", id: "import" } }), /invalid_proposal/);
  await assert.rejects(commitInitialProposal(pool, input, cases[2] as never), /invalid_proposal/);
});
test("database rejects missing assertion metadata and commit-to-Signal mismatches", async () => {
  const first = await acquire(); const second = await acquire(first.principal.tenantId);
  const committed = await commitInitialProposal(pool, first.input, validateProposal(proposal(), first.input));
  assert(committed.status === "committed");
  const sql = `INSERT INTO model_assertions (id,tenant_id,receipt_id,semantic_commit_id,classification,claim,metadata) VALUES ($1,$2,$3,$4,'personal_knowledge','Synthetic',$5)`;
  await assert.rejects(pool.query(sql, [randomUUID(), first.principal.tenantId, first.receipt.receiptId, committed.commitId, {}]), { code: "23514" });
  const { claim: _claim, classification: _classification, observationIndexes: _indexes, ...metadata } = proposal().assertions[0]!;
  await assert.rejects(pool.query(sql, [randomUUID(), first.principal.tenantId, second.receipt.receiptId, committed.commitId, metadata]), { code: "23503" });
});
test("actual transaction failure rolls back assertions, receipt and version together", async () => {
  const { principal, receipt, input } = await acquire();
  await pool.query(`CREATE FUNCTION fail_assertion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic fault'; END $$;
    CREATE TRIGGER fail_assertion BEFORE INSERT ON model_assertions FOR EACH ROW EXECUTE FUNCTION fail_assertion()`);
  try {
    await assert.rejects(commitInitialProposal(pool, input, validateProposal(proposal(), input)), /synthetic fault/);
    assert.equal((await getRetainedSignal(pool, principal, receipt.receiptId))!.receipt.state, "accepted");
    assert.deepEqual(await getCurrentAssertions(pool, principal, 100), { assertions: [] });
    assert.equal((await evaluateSignal(pool, principal.tenantId, receipt.receiptId))!.stateVersion, "0");
    assert.equal((await pool.query("SELECT id FROM observations WHERE tenant_id=$1", [principal.tenantId])).rowCount, 0);
  } finally { await pool.query("DROP TRIGGER fail_assertion ON model_assertions; DROP FUNCTION fail_assertion()"); }
  assert.equal((await commitInitialProposal(pool, input, validateProposal(proposal(), input))).status, "committed");
});
test("upgrade from 004 preserves live and deleted Signals, aliases and retention guards twice", async () => {
  const upgradeSchema = "test_" + randomBytes(12).toString("hex");
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA "${upgradeSchema}"; SET search_path TO "${upgradeSchema}"`);
    await client.query("CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    for (const name of ["001_signals.sql", "002_signal_keys.sql", "003_source_revisions.sql", "004_signal_retention.sql"]) {
      await client.query(await readFile(new URL("../migrations/" + name, import.meta.url), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    }
  } finally { await client.query(`SET search_path TO "${schema}"`); client.release(); }
  const upgradePool = new Pool({ options: `-c search_path=${upgradeSchema}`, connectionString: process.env.TEST_DATABASE_URL ?? "postgres://pwm_test:local-test-only@127.0.0.1:55432/pwm_test" });
  try {
    const signal = { origin: owner.origin, fidelity: "raw" as const, content: "Synthetic migration fixture", idempotencyKey: "original", sourceItem: { id: "item", revision: "1" } };
    const live = await submitSignal(upgradePool, owner, signal);
    await submitSignal(upgradePool, owner, { ...signal, idempotencyKey: "alias" });
    const deleted = await submitSignal(upgradePool, owner, { ...signal, idempotencyKey: "deleted", sourceItem: { id: "item", revision: "2" } });
    await deleteSignalContent(upgradePool, owner, deleted.receiptId);
    await migrate(upgradePool); await migrate(upgradePool);
    assert.deepEqual(await submitSignal(upgradePool, owner, { ...signal, idempotencyKey: "alias" }), live);
    assert.equal((await getRetainedSignal(upgradePool, owner, live.receiptId))!.content, signal.content);
    assert.equal((await getRetainedSignal(upgradePool, owner, deleted.receiptId))!.content, null);
    await assert.rejects(upgradePool.query("DELETE FROM signals"), { code: "23514" });
  } finally { await upgradePool.end(); await pool.query(`DROP SCHEMA "${upgradeSchema}" CASCADE`); }
});
test("deleted in-flight Signal cannot commit and other tenant cannot forge lineage", async () => {
  const { principal, receipt, input } = await acquire();
  const validated = validateProposal(proposal(), input);
  await deleteSignalContent(pool, principal, receipt.receiptId);
  assert.equal((await commitInitialProposal(pool, input, validated)).status, "unavailable");
  assert.deepEqual(await getCurrentAssertions(pool, principal, 100), { assertions: [] });
  const live = await acquire();
  await assert.rejects(pool.query("INSERT INTO observations (id, tenant_id, receipt_id, description, excerpt) VALUES ($1,$2,$3,'x','x')", [randomUUID(), "wrong", live.receipt.receiptId]), { code: "23503" });
});
