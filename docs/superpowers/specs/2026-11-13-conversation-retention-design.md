# Durable acquired conversation retention (#32)

## Intent and scope
Preserve every acquired Signal exactly as received, with explicit raw/excerpt/summary fidelity, across retries and restarts. Pending conversation material must survive failed, partial or interrupted processing. Explicit user deletion/privacy requirements may remove content without claiming consolidation.

## Approach
Extend the existing PostgreSQL Signal ledger and canonical API. Keeping intake unchanged already preserves acquired content; add a database guard and a user-only recovery/deletion path. A separate conversation archive duplicates the ledger. Building Dreaming here would overlap #35 and #58.

All Signals receive conservative pending retention because intake has no conversation classification. No automatic cleanup or successful-consolidation producer ships in #32. #35 must add durable exact-revision coverage before enabling ordinary cleanup; receipt state alone is never sufficient.

## Interfaces and invariants
- Authenticated user-origin principals may GET or DELETE `/v1/signals/{receiptId}` within their tenant. Sources and Consumers cannot recover or delete content. Receipts remain origin-scoped and content-free.
- GET returns the original receipt, exact acquired content and retention metadata. Deleted content is null, explicitly marked deleted, never consolidated.
- DELETE is an explicit user privacy request, idempotently clears content while retaining operational tombstones. No public processing/cleanup override exists.
- PostgreSQL rejects ordinary row deletion, truncation and content replacement. Only a recorded explicit deletion may clear content. Immutable content digests keep duplicate detection valid without retaining deleted text. Replays cannot resurrect a deleted revision; genuinely new revisions remain independent pending inputs.
- Migration backfills digests without changing existing input or receipt metadata. Old writers keep working; after deletion old binaries may reject a retry with 409 rather than recover deleted content. Roll back application code while retaining additive schema; do not use destructive down-migrations.

## Proof and exclusions
Approved seams under the user's blanket authorization: canonical HTTP API for recoverability, privacy and isolation; real PostgreSQL writes as the public constraint boundary for attempted ordinary deletion and transaction rollback. Verify fidelity, duplicates, revisions, independent server/pool restarts, concurrent deletion/retry and upgrade preservation.

No invented transcript portions, learning worker, semantic write surface, grants service, automatic retention schedule or production deployment.
