import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Principal, Receipt, Signal } from "./contracts.js";

export class SignalConflict extends Error {}

type SignalRow = {
  receipt_id: string;
  content: string;
  origin_type: Signal["origin"]["type"];
  origin_id: string;
  fidelity: Signal["fidelity"];
  source_item_id: string | null;
  source_revision: string | null;
  source_cursor: string | null;
  state: Receipt["state"];
  received_at: Date;
};

function assertSameInput(row: SignalRow, signal: Signal): void {
  if (row.content !== signal.content || row.fidelity !== signal.fidelity ||
      row.source_item_id !== (signal.sourceItem?.id ?? null) ||
      row.source_revision !== (signal.sourceItem?.revision ?? null)) {
    throw new SignalConflict("idempotency_conflict");
  }
}

function receipt(row: SignalRow): Receipt {
  return {
    receiptId: row.receipt_id,
    state: row.state,
    origin: { type: row.origin_type, id: row.origin_id },
    fidelity: row.fidelity,
    ...(row.source_item_id !== null ? {
      sourceItem: {
        id: row.source_item_id,
        ...(row.source_revision !== null ? { revision: row.source_revision } : {}),
        ...(row.source_cursor !== null ? { cursor: row.source_cursor } : {}),
      },
    } : {}),
    receivedAt: row.received_at.toISOString(),
  };
}

export async function submitSignal(pool: Pool, principal: Principal, signal: Signal): Promise<Receipt> {
  const client = await pool.connect();
  const scope = [principal.tenantId, principal.origin.type, principal.origin.id];
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '10s'");
    // PostgreSQL owns serialization across all API instances, not an in-process lock.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(scope)]);
    const existing = await client.query<SignalRow>(
      `SELECT s.* FROM signals s JOIN signal_keys k ON s.receipt_id = k.receipt_id
       WHERE k.tenant_id = $1 AND k.origin_type = $2 AND k.origin_id = $3 AND k.idempotency_key = $4`,
      [...scope, signal.idempotencyKey],
    );
    if (existing.rows[0]) {
      assertSameInput(existing.rows[0], signal);
      await client.query("COMMIT");
      return receipt(existing.rows[0]);
    }
    let row: SignalRow | undefined;
    if (signal.sourceItem?.revision !== undefined) {
      const revision = await client.query<SignalRow>(
        `SELECT * FROM signals WHERE tenant_id = $1 AND origin_type = $2 AND origin_id = $3
         AND source_item_id = $4 AND source_revision = $5`,
        [...scope, signal.sourceItem.id, signal.sourceItem.revision],
      );
      row = revision.rows[0];
    }
    if (row) {
      assertSameInput(row, signal);
    } else {
      const result = await client.query<SignalRow>(
        `INSERT INTO signals (
          receipt_id, tenant_id, origin_type, origin_id, fidelity, content,
          source_item_id, source_revision, source_cursor
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [randomUUID(), ...scope, signal.fidelity, signal.content,
          signal.sourceItem?.id ?? null, signal.sourceItem?.revision ?? null, signal.sourceItem?.cursor ?? null],
      );
      row = result.rows[0]!;
    }
    await client.query(
      `INSERT INTO signal_keys (tenant_id, origin_type, origin_id, idempotency_key, receipt_id)
       VALUES ($1,$2,$3,$4,$5)`, [...scope, signal.idempotencyKey, row.receipt_id],
    );
    await client.query("COMMIT");
    return receipt(row);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getReceipt(pool: Pool, principal: Principal, id: string): Promise<Receipt | undefined> {
  const result = await pool.query<SignalRow>(
    `SELECT receipt_id, origin_type, origin_id, fidelity, source_item_id,
      source_revision, source_cursor, state, received_at
      FROM signals WHERE receipt_id = $1 AND tenant_id = $2 AND origin_type = $3 AND origin_id = $4`,
    [id, principal.tenantId, principal.origin.type, principal.origin.id],
  );
  return result.rows[0] ? receipt(result.rows[0]) : undefined;
}
