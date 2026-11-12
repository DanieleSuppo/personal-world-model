# Signal intake and operational receipts (#31)

## Approved scope

Implement issue #31, **Receive idempotent Signals with explicit origin and receipts**, under SPEC #16. The user approved the design, canonical API test seam and local development approach in this session. Implementation stays in the current branch and is performed directly; independent subagents review the completed work.

The product is an API-based Personal Context Engine, intended for managed hosting and independent self-hosting. Running it on the developer's machine is a development arrangement, not a local-first product decision.

## Approaches

- **Chosen:** a small Node.js/TypeScript HTTP service with PostgreSQL transactions and constraints. PostgreSQL is required by the SPEC; TypeScript and the Node HTTP server are implementation choices. Tests use the real API and PostgreSQL.
- An in-memory or SQLite prototype would not establish the required authoritative storage or cross-process idempotency.
- A larger framework, broker or learning worker would add machinery outside this ticket. They are not prerequisites for intake.

## Runtime and trust boundary

Development runs Node on the host and PostgreSQL in a dedicated Docker Compose service, bound to loopback. Development data uses a persistent volume. Tests use a separate PostgreSQL service and database, never the development database. No cloud resource is created.

The HTTP process binds to loopback by default. Production HTTPS termination and private database networking belong to deployment configuration, not this ticket. Managed key custody, account identity, consumer grants/revocation, and source connections remain later tickets. This slice uses explicitly provisioned high-entropy bearer credentials mapped server-side to one tenant and one origin. It must fail closed without valid credentials. It is not a production managed authentication service.

## Canonical API

- `POST /v1/signals`: JSON containing `origin: {type, id}`, `fidelity` (`raw`, `excerpt`, `summary`), `idempotencyKey`, text `content`, and optional `sourceItem: {id, revision?, cursor?}`. Source-origin submissions require a Source Item. The authenticated principal, never request data, selects the tenant. Submitted origin must match the principal.
- `GET /v1/signal-receipts/{receiptId}`: retrieve an operational receipt scoped to the authenticated tenant and origin. Unknown and inaccessible receipts both return 404.
- Receipts contain `receiptId`, operational `state`, origin, fidelity, optional Source Item metadata and acceptance timestamp. They never echo content, Candidate Interpretations, or semantic proposals.
- The receipt vocabulary is `accepted`, `deferred`, `reassessing`, `committed`, `no meaningful change`, `rejected`. Intake creates `accepted`; it does not pretend to implement later learning transitions. Invalid submissions return a `rejected` operational error without a durable accepted receipt.

## Invariants

1. Persist the Signal and its logical receipt atomically before acknowledging acceptance.
2. Scope idempotency keys by tenant and origin. Retries return the existing logical receipt, including across process restarts and concurrent requests.
3. Within that scope, a Source Item identity plus supplied revision identifies one Signal even when a retry has a new idempotency key. Persist alias keys so subsequent reuse cannot redirect them.
4. A changed revision submitted with a new idempotency key creates a distinct Signal correlated by the same Source Item identity. Without an available revision, the caller's idempotency key distinguishes deliveries; do not invent revisions or silently suppress updates.
5. A key or identity/revision reused with different semantic input is a conflict (409), never an overwrite. Cursor is delivery metadata, not a new revision; retries retain the first receipt's cursor.
6. Only the Engine can later interpret a Signal. Intake accepts no semantic write fields and starts no learning operation.
7. Persist acquired content unchanged. Do not implement cleanup before conversation consolidation exists (#32 onward).
8. Bound request size, validate all external fields, use parameterized SQL, avoid content or credential logging, and never expose another principal's receipt.

## Verification and stop condition

Tests exercise only the canonical HTTP API against PostgreSQL. Cover origin/fidelity, duplicate keys, revision deduplication, conflicting content, concurrent submissions through independent service instances, receipt lookup after restart, tenant/origin isolation and invalid/oversized requests. Database access is fixture setup, not an assertion side channel.

Run typechecking and focused tests during implementation, then the full suite and independent Standards/Spec reviews. Stop when #31 passes. Do not build Dreaming, inference, Context Bundles, frontend, managed deployment, MCP or source adapters.
