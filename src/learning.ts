import type { Pool } from "pg";
import { commitInitialProposal, deferLearning, evaluateSignal } from "./knowledge.js";
import { interpretSignal, type ProcessorOptions } from "./processor.js";
import { InvalidProposal, policyVersion, validateProposal } from "./semantic-contracts.js";

export function createLearningRunner(options: { pool: Pool; processor?: ProcessorOptions }): { start(): void; stop(): Promise<void> } {
  let started = false, stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();
  const controller = new AbortController();
  const policy = options.processor?.fingerprint ?? policyVersion;
  async function processOne(tenant: string, receipt: string): Promise<void> {
    if (!options.processor) { await deferLearning(options.pool, tenant, receipt, policy, "processor_not_configured"); return; }
    for (let attempt = 0; attempt < 3 && !stopped; attempt++) {
      const input = await evaluateSignal(options.pool, tenant, receipt, policy);
      if (!input) { await deferLearning(options.pool, tenant, receipt, policy, "content_deleted"); return; }
      let proposal;
      try { proposal = validateProposal(await interpretSignal(input, options.processor, controller.signal), input); }
      catch (error) {
        // Shutdown abort is not a processor diagnosis: leave work eligible for next startup.
        if (!stopped) await deferLearning(options.pool, tenant, receipt, policy, error instanceof InvalidProposal ? "invalid_proposal" : "processor_failed");
        return;
      }
      if (stopped) return;
      try {
        const result = await commitInitialProposal(options.pool, input, proposal);
        if (result.status === "stale") continue;
        if (result.status === "unavailable") await deferLearning(options.pool, tenant, receipt, policy, "content_deleted");
        return;
      } catch {
        await deferLearning(options.pool, tenant, receipt, policy, "storage_failed"); return;
      }
    }
    if (!stopped) await deferLearning(options.pool, tenant, receipt, policy, "stale_contention");
  }
  async function scan(): Promise<void> {
    try {
      const pending = await options.pool.query<{ tenant_id: string; receipt_id: string }>(`SELECT s.tenant_id,s.receipt_id FROM signals s
        LEFT JOIN signal_learning_attempts a ON a.tenant_id=s.tenant_id AND a.receipt_id=s.receipt_id
        WHERE s.state IN ('accepted','deferred') AND (a.receipt_id IS NULL OR a.state='pending'
          OR ($1 AND a.state='deferred' AND a.reason='processor_not_configured'))
        AND NOT EXISTS (SELECT 1 FROM semantic_commits c WHERE c.tenant_id=s.tenant_id AND c.receipt_id=s.receipt_id)
        ORDER BY s.received_at,s.receipt_id LIMIT 1`, [!!options.processor]);
      // Select anew after every attempt: a queued batch could already be completed by another instance.
      const row = pending.rows[0];
      if (row && !stopped) await processOne(row.tenant_id, row.receipt_id);
    } catch {
      // If even operational deferral cannot persist, stop rather than retrying an undiagnosed failure.
      stopped = true;
      console.error("Learning stopped after a storage failure; diagnose and restart explicitly.");
    }
    if (!stopped) { timer = setTimeout(() => { running = scan(); }, 250); timer.unref(); }
  }
  return {
    start() { if (started || stopped) return; started = true; running = scan(); },
    async stop() { stopped = true; if (timer) clearTimeout(timer); controller.abort(); await running; },
  };
}
