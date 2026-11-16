# Local development and initial learning API (#31–#33)

This repository contains durable Signal intake, protected acquired-content retention and asynchronous initial semantic learning. It is an API service, not a frontend, desktop app or deployed managed service. Only the Engine validates and commits assertions; Source and Consumer clients submit Signals, never trusted proposals.

## Where components run

```text
Developer machine
  Node.js API on 127.0.0.1:3000
    -> Docker PostgreSQL on 127.0.0.1:55431 (persistent development volume)
  API contract tests
    -> separate Docker PostgreSQL on 127.0.0.1:55432 (disposable test storage)
```

The long-term product supports managed hosting and independent self-hosting. Production requires HTTPS ingress, private database connectivity, appropriate identity and secret management, backups and the later managed-security work. Docker Compose here is only a local development setup; its fixed database passwords must never be reused for production. No cloud resources or external AI calls are required. Tests use synthetic local HTTP processor fixtures only. An operator may explicitly configure a processor for learning as described below.

## Start development

Requirements: Node.js 22 or later, npm, Docker Engine and Docker Compose. Run commands from the repository root on Linux/macOS.

```sh
npm ci
cp .env.example .env
npm run db:dev
npm run migrate
```

Create local credentials once. This refuses to overwrite an existing file. Each random token identifies exactly one tenant and origin; the file is ignored by Git and readable only by its owner.

```sh
node --input-type=module <<'JS'
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('.local', { recursive: true, mode: 0o700 });
const principals = [
  { type: 'source', id: 'calendar' },
  { type: 'consumer', id: 'anthropic' },
  { type: 'user', id: 'owner' },
].map(origin => ({
  token: randomBytes(32).toString('hex'),
  tenantId: 'local-owner',
  origin,
}));
writeFileSync('.local/principals.json', JSON.stringify(principals, null, 2), {
  flag: 'wx', mode: 0o600,
});
console.log('Local credentials created in .local/principals.json');
JS
npm run dev
```

`src/main.ts` loads `.env` when present; existing environment variables take precedence. `DATABASE_URL` and `PWM_PRINCIPALS_FILE` are required. `PORT` defaults to 3000. The process binds only to loopback and fails startup when configuration, credentials, database connectivity or the schema is missing.

For a compiled run:

```sh
npm run build
npm start
```

The startup log contains the local address, never bearer credentials or personal content. Generic startup errors intentionally omit driver/configuration details that could contain secrets. Check configuration, database availability and `npm run migrate` when startup fails.

### Authentication boundary

The credential file is bootstrap provisioning for this local slice, not a managed account/login system. Tokens must be randomly generated with at least 32 bytes of entropy; the API also rejects short or duplicate configured tokens. Configuration is read at startup. Changing credentials requires restarting every API process. Full Consumer grants and immediate revocation belong to subsequent tickets; do not expose this development service as a production managed product.

The request cannot select its tenant. The server derives the tenant and origin from the bearer token and rejects a mismatching claimed origin. Tokens are compared by fixed-size digest. Do not commit the credential file or `.env`.

## Canonical Signal API

### Submit a Signal

```sh
TOKEN=$(node -p "JSON.parse(require('fs').readFileSync('.local/principals.json', 'utf8'))[0].token")
curl --fail-with-body http://127.0.0.1:3000/v1/signals \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "origin": {"type": "source", "id": "calendar"},
    "fidelity": "raw",
    "idempotencyKey": "calendar-event-42-revision-1",
    "sourceItem": {"id": "event-42", "revision": "1", "cursor": "page-7"},
    "content": "Family trip on Saturday."
  }'
```

A successful first submission or retry returns HTTP 202 and the same logical receipt:

```json
{
  "receiptId": "<opaque UUID>",
  "state": "accepted",
  "origin": {"type": "source", "id": "calendar"},
  "fidelity": "raw",
  "sourceItem": {"id": "event-42", "revision": "1", "cursor": "page-7"},
  "receivedAt": "<UTC timestamp>"
}
```

Contract:

- `origin.type`: `source`, `consumer`, or `user`. It must match the authenticated principal, including `origin.id`.
- `fidelity`: `raw`, `excerpt`, or `summary`. This describes acquired input; it never grants semantic authority.
- `idempotencyKey`: required nonempty string. Tenant and origin scope its uniqueness.
- `content`: required nonempty text, at most 49,152 Unicode code points. The entire UTF-8 JSON request must also fit within 65,536 bytes. Content is retained unchanged until an explicit user/privacy deletion; no automatic cleanup runs in this slice.
- `sourceItem`: required for Source origin, optional otherwise. `id` is the stable external identity. `revision` and incremental `cursor` are optional nonempty strings; omit unavailable values instead of sending null. IDs, revisions and keys are limited to 256 Unicode code points; cursors to 2,048.
- All strings must be valid Unicode without NUL characters. Unknown fields are rejected, including tenant selection and attempted semantic writes.

An identical item/revision is a redelivery even with a different key. Such keys become durable aliases for the original receipt. Different content, fidelity, item identity or revision under an already-used key returns 409. Different content or fidelity for an already-known item/revision also returns 409. Conflicts never overwrite the accepted Signal.

A new revision with a new key creates a new Signal, correlated through the same Source Item identity. Revisions are opaque: the API does not order them. When no revision is available, keys determine idempotency; callers must reuse a key for retries and use a new key for an update. Cursor changes alone do not create a new revision; a duplicate returns the original receipt and its original cursor. Cursor-based synchronization remains adapter work.

### Read a receipt

```sh
curl --fail-with-body http://127.0.0.1:3000/v1/signal-receipts/RECEIPT_UUID \
  -H "Authorization: Bearer $TOKEN"
unset TOKEN
```

HTTP 200 returns the operational receipt only. No source content, Candidate Interpretation, tenant identifier or semantic record is returned. Receipts are accessible only to the same tenant and origin. Unknown and inaccessible receipts both return 404. Responses are marked `Cache-Control: no-store`.

The operational vocabulary is `accepted`, `deferred`, `reassessing`, `committed`, `no meaningful change`, and `rejected`. Initial intake returns independently of processor latency. The Engine later records `committed`, `no meaningful change` or `deferred`; clients cannot set state. A rejected HTTP request has no new accepted receipt:

```json
{"state":"rejected","code":"idempotency_conflict"}
```

| HTTP status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_json` / `invalid_signal` | Invalid JSON, encoding or contract |
| 401 | `unauthorized` | Missing/invalid bearer credential |
| 403 | `origin_mismatch` | Claimed origin differs from the credential |
| 404 | `not_found` | Unknown route, receipt or inaccessible receipt |
| 409 | `idempotency_conflict` | Key or revision conflicts with accepted input |
| 413 | `payload_too_large` | Request exceeds the byte limit |
| 415 | `unsupported_media_type` | Content type is not JSON |
| 500 | `internal_error` | Unexpected application, schema or configuration fault |
| 503 | `storage_unavailable` | Recognized storage connectivity or transient database failure |

After a network failure or 503, retry the **same** idempotency key with bounded backoff and a finite attempt limit: a lost response may follow a committed transaction. Do not assume an error proves the Signal was not stored. A 500 is not an invitation to retry indefinitely: investigate the application, schema or configuration first, then reuse the original key after fixing the fault.

Recognized connectivity/system errors and transient PostgreSQL SQLSTATE codes map to 503. The installed driver's known uncoded connection/timeout failures are recognized by exact message; other unknown failures map to 500. Query cancellation/timeouts can reflect temporary contention and remain 503; persistent timeouts require investigation, not unlimited retries. Using a pool or client that application code deliberately closed is an internal fault, not a connectivity outage. Internal faults emit a static, content-free diagnostic. Neither response bodies nor this diagnostic expose raw exceptions, database queries, credentials or personal content.

## Acquired-content retention (#32)

All accepted Signals receive conservative pending retention, including acquired conversations. Intake does not yet classify conversation versus non-conversation material. Fidelity describes exactly what was acquired: `excerpt` and `summary` never imply that missing transcript portions exist.

### Recover or explicitly delete acquired content

Only a configured `user`-origin principal in the same tenant may access `GET /v1/signals/{receiptId}` or `DELETE /v1/signals/{receiptId}`. In this local credential model, provisioning a user-origin token grants owner access within that tenant. Source and Consumer tokens cannot use these routes, even for their own submissions. Unknown and inaccessible Signals both return 404; missing/invalid credentials return 401. These are owner operations, not a Consumer context-serving bypass.

For the example credential file above, the third credential is the user:

```sh
USER_TOKEN=$(node -p "JSON.parse(require('fs').readFileSync('.local/principals.json', 'utf8'))[2].token")
curl --fail-with-body http://127.0.0.1:3000/v1/signals/RECEIPT_UUID \
  -H "Authorization: Bearer $USER_TOKEN"
# Explicitly request deletion of this acquired payload, not the whole source/model:
curl --fail-with-body -X DELETE http://127.0.0.1:3000/v1/signals/RECEIPT_UUID \
  -H "Authorization: Bearer $USER_TOKEN"
unset USER_TOKEN
```

Both successful operations return HTTP 200 with `Cache-Control: no-store`. Recovery returns:

```json
{
  "receipt": {"receiptId": "<UUID>", "state": "accepted", "origin": {"type": "source", "id": "chat-export"}, "fidelity": "excerpt", "sourceItem": {"id": "conversation-1", "revision": "1"}, "receivedAt": "<UTC timestamp>"},
  "content": "Exactly the acquired excerpt, without invented transcript portions.",
  "retention": {"state": "pending"}
}
```

Explicit deletion returns the same envelope with `"content": null` and `"retention": {"state": "deleted", "reason": "user_request", "deletedAt": "<UTC timestamp>"}`. Repeated deletion returns the original deletion metadata. The operational receipt remains unchanged: deletion is **not** successful Dreaming or a Semantic Commit.

The database guards acquired identity/fidelity and prevents ordinary row deletion, truncation and content replacement. Failed or rolled-back processing and even a `committed` operational receipt never authorize raw cleanup. A trusted privacy-policy operation may atomically clear `signals.content`, set `content_deleted_at` and set `content_deletion_reason = 'privacy_policy'`; this does not claim consolidation either. Neither Source nor Consumer APIs expose that operation.

The trusted operator binds `$1` to the intended tenant when executing this privacy-policy statement:

```sql
UPDATE signals
SET content = NULL,
    content_deleted_at = CURRENT_TIMESTAMP,
    content_deletion_reason = 'privacy_policy'
WHERE tenant_id = $1 AND content IS NOT NULL;
```

Already-deleted rows must be excluded: their original reason/timestamp is immutable. The tenant-scoped statement is safe to retry; pending rows are cleared without rewriting earlier deletion records.


Deleted payloads retain receipt/source identity, key bindings and a private SHA-256 content fingerprint so exact retries remain idempotent and changed-content retries still conflict without retaining the original text. Duplicate keys or item/revision aliases cannot resurrect deleted content. New revisions remain independently pending; when no revision exists, callers must keep retry keys stable. This payload-deletion operation is not full account erasure: operational metadata and fingerprints remain, and backup expiry/account exit belong to later privacy/deployment work.

There is deliberately no cleanup scheduler or successful-consolidation marker here. #35 must persist an atomic successful Dreaming outcome and exact covered revisions before extending the guard to permit ordinary cleanup. #58 owns automatic selection/retries. A later or concurrent revision is never covered merely because an earlier revision was processed.

## Initial semantic learning (#33)

### Explicit processor opt-in

Without processor configuration, intake remains available and retained Signals become visibly `deferred` with internal reason `processor_not_configured`. No default endpoint, provider or model exists. To opt in, set both `PWM_PROCESSOR_BASE_URL` and `PWM_PROCESSOR_MODEL`; `PWM_PROCESSOR_API_KEY` is optional when those are set. Partial or invalid configuration fails startup with a content-free error. Restart after configuration changes.

```sh
# Example for a locally operated OpenAI-compatible processor; choose its actual model name.
PWM_PROCESSOR_BASE_URL=http://127.0.0.1:8000/v1
PWM_PROCESSOR_MODEL=your-explicit-model
# PWM_PROCESSOR_API_KEY=your-secret-if-required
```

The base URL is an API prefix: `https://processor.example/v1` becomes `https://processor.example/v1/chat/completions`. A trailing slash is normalized. Do not supply the full `/chat/completions` endpoint. HTTPS is required except loopback HTTP (`localhost`, `127.0.0.1`, `[::1]`); URL userinfo, queries, fragments and redirects are forbidden. No URL, key, prompt, acquired text or processor response is logged.

**Configuring a processor authorizes sending acquired text to that operator-selected endpoint.** Check its no-training and operation-only retention terms first. These terms are an operator responsibility, not technically enforced managed privacy protections. Never use real user content during development or tests. The processor receives only the current Signal's acquired text, actual origin and fidelity plus bounded interpretation instructions, not tenant IDs, credentials from the Signal API, unrelated assertions or the whole model. The processor's own optional API key authenticates only its configured endpoint.

Each work attempt makes one HTTP request with a 30-second timeout and a 64-KiB response limit. There are no redirects, tools, model actions, provider fallback or automatic processor-error retries. Signal text is explicitly untrusted data. Strict output validation rejects unknown fields, forged identities, unsupported operations, fabricated excerpts, invalid dates/indexes and imported claims of authenticated user-stated authority. These controls cannot prove semantic truth or make a model immune to instruction injection.

### Outcomes, restart and failure recovery

A small startup/periodic scan processes one Signal per runner at a time. Learning is asynchronous with no priority, ordering, freshness or latency SLA. PostgreSQL, not process-local exclusion, controls independent instances. Only `add` and `no_meaningful_change` are supported. Successful interpretation stores compact Observations and source/revision/fidelity lineage, then atomically commits distinct current Personal Knowledge and High-confidence Hypotheses. A no-change outcome stores compact terminal lineage but no assertions. Private reasoning, prompts, raw model responses and Candidate Interpretations are not persisted.

`current` means the Engine's present conclusion, not permanently true. Validity can describe a past interval and remains independent of applicability. Unknown temporal bounds are omitted. Support is a bounded description, not a global confidence score. Separate Signals may yield overlapping initial assertions; textual similarity does not deduplicate or reinforce them, and correlated revisions remain identifiable.

The conservative Relevant State Version covers the entire tenant. A different semantic change can invalidate an interpretation even for an unrelated topic. The Engine never merges stale proposals silently: it reevaluates at most three times, then defers with `stale_contention`. Exact replay returns the original completion before checking the current version; changed proposal payloads under the same input/policy identity conflict. A new processor configuration fingerprint never automatically reprocesses terminal successful Signals.

Missing-configuration deferrals automatically become eligible once a configured runner starts. Configured processor faults defer with `processor_failed`; invalid semantic output uses `invalid_proposal`. Commit faults defer with `storage_failed` when storage permits recording that diagnosis. These records retain content and remain deferred across scans and restarts until explicit operator diagnosis/requeue. If operational metadata itself cannot persist, learning stops with a static diagnostic rather than looping; investigate storage and restart explicitly. Shutdown aborts and waits for in-flight HTTP before ending the database pool, leaving interrupted, uncommitted work resumable.

There is no public retry endpoint. After diagnosis, a trusted operator may requeue only the intended tenant/receipt. Bind `$1` to the tenant and `$2` to the receipt; run every statement in the same transaction/connection. The row lock and terminal check are required, including when another instance may complete concurrently:

```sql
BEGIN;
SELECT receipt_id FROM signals
WHERE tenant_id = $1 AND receipt_id = $2 FOR UPDATE;
UPDATE signal_learning_attempts a
SET state = 'pending', reason = NULL, updated_at = CURRENT_TIMESTAMP
WHERE a.tenant_id = $1 AND a.receipt_id = $2
  AND a.state = 'deferred' AND a.reason <> 'processor_not_configured'
  AND NOT EXISTS (
    SELECT 1 FROM semantic_commits c
    WHERE c.tenant_id = a.tenant_id AND c.receipt_id = a.receipt_id
  );
COMMIT;
```

The receipt stays `deferred` until subsequent processing succeeds. Never requeue deleted content expecting recovery: `content_deleted` cannot restore acquired text. Safe, content-free operational reasons are available to the trusted operator in `signal_learning_attempts`, not other origins' receipt reads. Do not alter successful commits, input identities or retained content to force processing.

### Owner-only bounded inspection

`GET /v1/model-assertions?limit=50` returns `{ "assertions": [...] }` with `Cache-Control: no-store`. Only same-tenant `user` credentials can inspect assertions. Source/Consumer access returns 404; another tenant's owner sees only its own assertions. Missing/invalid authentication returns 401. `limit` must be an integer from 1 to 100 (default 50); unknown or repeated query parameters return 400 `invalid_limit`. Results use deterministic `(createdAt,id)` order; this is a bounded first page, not a search or pagination framework.

Each assertion includes `id`, `revision` (initially 1), `claim`, explicit `classification` (`personal_knowledge` or `high_confidence_hypothesis`), `originBasis`, descriptive `support`, `validity`, `applicability`, `sensitivity`, optional `semanticAnchors`, `createdAt` and compact `observations`. Observation fields are `id`, `description`, selected `excerpt`, `receiptId`, actual `origin`, `fidelity` and available `sourceItem` identity/revision/cursor. No full Signal content, tenant identifier, candidate text, prompt or private reasoning is returned. This owner inspection seam is not Consumer Context Bundle serving or a sensitivity-policy bypass for Consumers.

### Retention and privacy deletion remain separate

Incremental Semantic Commit is **not** successful Dreaming and never permits ordinary acquired-content cleanup. Raw content remains owner-recoverable after add, no-change, processor failure and rolled-back commits. Migration 004 guards are unchanged. If privacy deletion locks the Signal first, an in-flight interpretation cannot subsequently create new assertions from that content. If Semantic Commit wins first, the existing #32 payload-deletion operation removes only acquired raw content: existing assertions and compact selected excerpts remain. Full semantic/account erasure and backup expiry require later privacy work; do not represent this payload deletion as erasing all learned information.

## Storage, concurrency and migrations

PostgreSQL stores one Signal with its receipt metadata and a separate set of idempotency-key bindings. An atomic transaction uses a PostgreSQL advisory lock scoped to tenant/origin; database constraints additionally enforce unique keys and available item/revision identities. Independent API processes therefore share the same concurrency boundary. If a connection fails during a Signal intake transaction, cleanup preserves the original operation error and discards the broken client instead of returning it to the pool. Serialization is deliberately conservative for this first slice; there is no throughput SLA.

Run `npm run migrate` before starting a new version. Versioned SQL files are applied once, transactionally, under a migration lock. These additive migrations do not delete personal data. Migration 004 backfills content fingerprints and installs retention guards without changing acquired content or receipt identity. Back up an existing development/self-hosted database before upgrading; do not migrate a production database through this development setup. Migration 005 adds the initial semantic ledger, tenant model versions, compact evidence links and safe learning-attempt metadata without changing migration 004 or raw-retention guards. Startup checks both retention and semantic tables and fails closed if migration has not run. A failed migration rolls back. Do not edit an applied migration or use destructive down-migrations to roll back application code; retain the compatible schema, and back up the database before later schema changes. Pre-#32 binaries can still insert Signals and serve receipts with this schema, but may return 409 for retries of explicitly deleted payloads; they cannot restore deleted content. Keep #32 code when exact post-deletion retry behavior is required. To roll back #33 application code, stop learning and retain migration 005 and all semantic state. Older binaries can continue intake/retention but cannot learn or inspect assertions; they must not be used to erase semantic records. `node dist/src/migrate.js` is also available after building.

Stopping the development database preserves its named volume:

```sh
docker compose stop postgres
```

Do not use `docker compose down --volumes` unless you explicitly intend to erase development data.

## Verification

```sh
npm run db:test
npm run typecheck
npm run test:signals  # focused contract file
npm test              # full suite
npm run build
```

Tests use `TEST_DATABASE_URL` when set; otherwise they use the dedicated `pwm_test` database on port 55432. Each suite creates its own randomly named schema and removes only that schema afterward. Never point tests at a production database. Recoverability and privacy assertions use HTTP responses, not database contents. Retention tests additionally attempt writes against PostgreSQL's constraint boundary and roll back interrupted transactions; they then verify retained content through HTTP. Fixtures use actual PostgreSQL and the real processor adapter against synthetic local HTTP servers; no database mocks replace the acceptance contract.

The tests cover receipts, retries, conflicts, revisions, concurrent independent API instances, restart persistence, origins/fidelity, tenant/origin isolation, request validation, ordinary-cleanup prevention, explicit privacy deletion, replay tombstones and additive upgrade preservation. CI uses a dedicated PostgreSQL 17 service for the same suite. The test database is disposable; stopping its container loses its contents.

Not implemented here: semantic updates/reinforcement/corrections, Episodes (#34), successful Dreaming/consolidation and ordinary post-consolidation cleanup (#35), automatic consolidation (#58), Context Bundle serving, source adapters, consumer grant management, frontend, MCP, managed cryptography or production deployment.
