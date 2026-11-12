# Local development and Signal API (#31)

This repository now contains the first runnable Personal Context Engine slice: durable Signal intake and operational receipts. It is an API service, not a frontend, desktop app, learning engine, or deployed managed service.

## Where components run

```text
Developer machine
  Node.js API on 127.0.0.1:3000
    -> Docker PostgreSQL on 127.0.0.1:55431 (persistent development volume)
  API contract tests
    -> separate Docker PostgreSQL on 127.0.0.1:55432 (disposable test storage)
```

The long-term product supports managed hosting and independent self-hosting. Production requires HTTPS ingress, private database connectivity, appropriate identity and secret management, backups and the later managed-security work. Docker Compose here is only a local development setup; its fixed database passwords must never be reused for production. No cloud resources or external AI calls are involved.

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
- `content`: required nonempty text, at most 49,152 Unicode code points. The entire UTF-8 JSON request must also fit within 65,536 bytes. Content is retained unchanged; no cleanup runs in this slice.
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

The operational vocabulary is `accepted`, `deferred`, `reassessing`, `committed`, `no meaningful change`, and `rejected`. This slice persists `accepted`; it does not fabricate learning transitions or allow clients to set state. Later Engine work owns those transitions. A rejected HTTP request has no new accepted receipt:

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

After a network failure or 503, retry the **same** idempotency key: a lost response may follow a committed transaction. Do not assume an error proves the Signal was not stored. A 500 is not an invitation to retry indefinitely: investigate the application, schema or configuration first, then reuse the original key after fixing the fault.

Recognized connectivity/system errors and transient PostgreSQL SQLSTATE codes map to 503. The installed driver's known uncoded connection/timeout failures are recognized by exact message; other unknown failures map to 500. Internal faults emit a static, content-free diagnostic. Neither response bodies nor this diagnostic expose raw exceptions, database queries, credentials or personal content.

## Storage, concurrency and migrations

PostgreSQL stores one Signal with its receipt metadata and a separate set of idempotency-key bindings. An atomic transaction uses a PostgreSQL advisory lock scoped to tenant/origin; database constraints additionally enforce unique keys and available item/revision identities. Independent API processes therefore share the same concurrency boundary. Serialization is deliberately conservative for this first slice; there is no throughput SLA.

Run `npm run migrate` before starting a new version. Versioned SQL files are applied once, transactionally, under a migration lock. These additive migrations do not delete personal data. A failed migration rolls back. Do not edit an applied migration or use destructive down-migrations to roll back application code; retain the compatible schema, and back up the database before later schema changes. `node dist/src/migrate.js` is also available after building.

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

Tests use `TEST_DATABASE_URL` when set; otherwise they use the dedicated `pwm_test` database on port 55432. Each suite creates its own randomly named schema and removes only that schema afterward. Never point tests at a production database. Assertions use HTTP responses, not database contents. Fixtures use actual PostgreSQL; no worker or database mocks replace the acceptance contract.

The tests cover receipts, retries, conflicts, revisions, concurrent independent API instances, restart persistence, origins/fidelity, tenant/origin isolation and request validation. CI uses a dedicated PostgreSQL 17 service for the same suite. The test database is disposable; stopping its container loses its contents.

Not implemented here: conversation consolidation/retention lifecycle (#32 onward), semantic learning, Context Bundle serving, source adapters, consumer grant management, frontend, MCP, managed cryptography or production deployment.
