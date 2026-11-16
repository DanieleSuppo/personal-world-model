import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Principal, Signal } from "./contracts.js";
import { canonicalDigest, policyVersion, validateProposal, type EvaluationInput, type ValidatedProposal } from "./semantic-contracts.js";

// As in intake, preserve the original failure and discard a connection whose rollback fails.
async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  const failed = () => { discard = true; };
  client.on("error", failed);
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); client.off("error", failed); }
}
type InputRow = {
  tenant_id: string; receipt_id: string; content: string | null; content_sha256: Buffer;
  origin_type: Signal["origin"]["type"]; origin_id: string; fidelity: Signal["fidelity"];
  source_item_id: string | null; source_revision: string | null; source_cursor: string | null;
};
function evaluation(row: InputRow, version: string, policyIdentity: string): EvaluationInput | undefined {
  if (row.content === null) return undefined;
  const input = {
    tenantId: row.tenant_id, receiptId: row.receipt_id, content: row.content,
    contentDigest: row.content_sha256.toString("hex"), origin: { type: row.origin_type, id: row.origin_id }, fidelity: row.fidelity,
    ...(row.source_item_id !== null ? { sourceItem: { id: row.source_item_id,
      ...(row.source_revision !== null ? { revision: row.source_revision } : {}),
      ...(row.source_cursor !== null ? { cursor: row.source_cursor } : {}),
    } } : {}), stateVersion: version, policyIdentity,
  };
  return { ...input, inputIdentity: canonicalDigest({ schemaVersion: 1, tenantId: input.tenantId, receiptId: input.receiptId, contentDigest: input.contentDigest, origin: input.origin, fidelity: input.fidelity, policyIdentity }) };
}
export async function evaluateSignal(pool: Pool, tenantId: string, receiptId: string, policyIdentity = policyVersion): Promise<EvaluationInput | undefined> {
  return transaction(pool, async client => {
    await client.query("INSERT INTO model_state_versions (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING", [tenantId]);
    // One statement snapshot binds the acquired Signal to its evaluated tenant version.
    const result = await client.query<InputRow & { revision: string }>(
      "SELECT s.*, v.revision FROM signals s JOIN model_state_versions v USING (tenant_id) WHERE tenant_id=$1 AND receipt_id=$2", [tenantId, receiptId]);
    const row = result.rows[0];
    return row ? evaluation(row, row.revision, policyIdentity) : undefined;
  });
}
export type CommitResult = { status: "committed" | "no_meaningful_change"; commitId: string; stateVersion: string } | { status: "stale" | "unavailable" };
type CommitRow = { id: string; operation: "add" | "no_meaningful_change"; committed_version: string; input_identity: string; proposal_digest: string };
function completion(row: CommitRow): CommitResult {
  return { status: row.operation === "add" ? "committed" : "no_meaningful_change", commitId: row.id, stateVersion: row.committed_version };
}
export async function commitInitialProposal(pool: Pool, input: EvaluationInput, raw: ValidatedProposal): Promise<CommitResult> {
  const proposal = validateProposal(raw, input);
  const digest = canonicalDigest(proposal);
  return transaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 1))", [JSON.stringify(["semantic", input.tenantId])]);
    const acquired = await client.query<InputRow>("SELECT * FROM signals WHERE tenant_id=$1 AND receipt_id=$2 FOR UPDATE", [input.tenantId, input.receiptId]);
    const row = acquired.rows[0];
    if (!row) return { status: "unavailable" };
    const done = (await client.query<CommitRow>("SELECT * FROM semantic_commits WHERE tenant_id=$1 AND receipt_id=$2", [input.tenantId, input.receiptId])).rows[0];
    // A lost response remains replayable even after version changes or raw payload deletion.
    if (done) {
      if (done.input_identity === input.inputIdentity && done.proposal_digest !== digest) throw new Error("proposal_conflict");
      return completion(done);
    }
    const fresh = evaluation(row, input.stateVersion, input.policyIdentity);
    if (!fresh) return { status: "unavailable" };
    if (fresh.inputIdentity !== input.inputIdentity || canonicalDigest(fresh) !== canonicalDigest(input)) throw new Error("input_conflict");
    validateProposal(proposal, fresh);
    const version = (await client.query<{ revision: string }>("SELECT revision FROM model_state_versions WHERE tenant_id=$1 FOR UPDATE", [input.tenantId])).rows[0]!;
    if (version.revision !== input.stateVersion) return { status: "stale" };
    const next = (BigInt(version.revision) + (proposal.decision === "add" ? 1n : 0n)).toString();
    const id = randomUUID();
    await client.query(`INSERT INTO semantic_commits (id, tenant_id, receipt_id, input_identity, policy_identity, proposal_digest, evaluated_version, committed_version, operation)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, input.tenantId, input.receiptId, input.inputIdentity, input.policyIdentity, digest, version.revision, next, proposal.decision]);
    const observations: string[] = [];
    for (const observation of proposal.observations) {
      const observationId = randomUUID(); observations.push(observationId);
      await client.query("INSERT INTO observations (id, tenant_id, receipt_id, description, excerpt) VALUES ($1,$2,$3,$4,$5)", [observationId, input.tenantId, input.receiptId, observation.description, observation.excerpt]);
    }
    for (const assertion of proposal.assertions) {
      const assertionId = randomUUID();
      const { claim, classification, observationIndexes, ...metadata } = assertion;
      await client.query(`INSERT INTO model_assertions (id, tenant_id, receipt_id, semantic_commit_id, classification, claim, metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [assertionId, input.tenantId, input.receiptId, id, classification, claim, metadata]);
      for (const index of observationIndexes) await client.query("INSERT INTO assertion_observations (tenant_id, receipt_id, assertion_id, observation_id) VALUES ($1,$2,$3,$4)", [input.tenantId, input.receiptId, assertionId, observations[index]]);
    }
    await client.query("UPDATE model_state_versions SET revision=$2 WHERE tenant_id=$1", [input.tenantId, next]);
    await client.query("UPDATE signals SET state=$3 WHERE tenant_id=$1 AND receipt_id=$2", [input.tenantId, input.receiptId, proposal.decision === "add" ? "committed" : "no meaningful change"]);
    await client.query(`INSERT INTO signal_learning_attempts (tenant_id, receipt_id, state, reason, policy_identity) VALUES ($1,$2,'completed',NULL,$3)
      ON CONFLICT (tenant_id,receipt_id) DO UPDATE SET state='completed', reason=NULL, policy_identity=$3, updated_at=CURRENT_TIMESTAMP`, [input.tenantId, input.receiptId, input.policyIdentity]);
    return { status: proposal.decision === "add" ? "committed" : "no_meaningful_change", commitId: id, stateVersion: next };
  });
}
export type LearningReason = "processor_not_configured" | "processor_failed" | "invalid_proposal" | "stale_contention" | "content_deleted" | "storage_failed";
export async function deferLearning(pool: Pool, tenantId: string, receiptId: string, policyIdentity: string, reason: LearningReason): Promise<void> {
  await transaction(pool, async client => {
    const row = await client.query("SELECT receipt_id FROM signals WHERE tenant_id=$1 AND receipt_id=$2 FOR UPDATE", [tenantId, receiptId]);
    if (!row.rowCount) return;
    if ((await client.query("SELECT id FROM semantic_commits WHERE tenant_id=$1 AND receipt_id=$2", [tenantId, receiptId])).rowCount) return;
    // A slow unconfigured worker cannot replace a diagnosed processor failure and make it retryable.
    await client.query(`INSERT INTO signal_learning_attempts (tenant_id,receipt_id,state,reason,policy_identity) VALUES ($1,$2,'deferred',$3,$4)
      ON CONFLICT (tenant_id,receipt_id) DO UPDATE SET state='deferred', reason=$3, policy_identity=$4, updated_at=CURRENT_TIMESTAMP
      WHERE signal_learning_attempts.state <> 'completed' AND ($3 <> 'processor_not_configured' OR signal_learning_attempts.reason = 'processor_not_configured' OR signal_learning_attempts.state = 'pending')`, [tenantId, receiptId, reason, policyIdentity]);
    await client.query("UPDATE signals SET state='deferred' WHERE tenant_id=$1 AND receipt_id=$2", [tenantId, receiptId]);
  });
}
export type AssertionView = {
  id: string; revision: number; classification: ValidatedProposal["assertions"][number]["classification"]; claim: string;
  originBasis: string; support: string; validity: { from?: string; until?: string }; applicability: string; sensitivity: string;
  semanticAnchors?: { kind: string; label: string }[]; createdAt: string;
  observations: { id: string; description: string; excerpt: string; receiptId: string; origin: Signal["origin"]; fidelity: Signal["fidelity"]; sourceItem?: Signal["sourceItem"] }[];
};
export async function getCurrentAssertions(pool: Pool, principal: Principal, limit: number): Promise<{ assertions: AssertionView[] } | undefined> {
  if (principal.origin.type !== "user") return undefined;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("invalid_limit");
  const result = await pool.query<{ view: AssertionView }>(`SELECT jsonb_build_object(
    'id',a.id,'revision',a.revision,'claim',a.claim,'classification',a.classification,'createdAt',a.created_at,
    'observations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'description',o.description,'excerpt',o.excerpt,
      'receiptId',s.receipt_id,'origin',jsonb_build_object('type',s.origin_type,'id',s.origin_id),'fidelity',s.fidelity)
      || CASE WHEN s.source_item_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('sourceItem',jsonb_strip_nulls(jsonb_build_object('id',s.source_item_id,'revision',s.source_revision,'cursor',s.source_cursor))) END ORDER BY o.id)
      FROM assertion_observations l JOIN observations o ON o.tenant_id=l.tenant_id AND o.id=l.observation_id
      JOIN signals s ON s.tenant_id=o.tenant_id AND s.receipt_id=o.receipt_id
      WHERE l.tenant_id=a.tenant_id AND l.assertion_id=a.id),'[]'::jsonb)) || a.metadata AS view
    FROM model_assertions a WHERE a.tenant_id=$1 AND a.current ORDER BY a.created_at,a.id LIMIT $2`, [principal.tenantId, limit]);
  return { assertions: result.rows.map(row => row.view) };
}
