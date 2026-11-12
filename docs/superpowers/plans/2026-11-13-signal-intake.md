# Implementation plan: Signal intake (#31)

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans to implement this plan task-by-task. The user explicitly forbids implementation subagents and requests independent review subagents at the end.

Design: `docs/superpowers/specs/2026-11-13-signal-intake-design.md`.
Review base: `23eab0802d921c25e410787713ed35eb4a3db7de` (starting HEAD). Include the previously requested README handoff correction, without reverting it.

## Task 1: runnable API and first durable receipt

- [x] Add Node/TypeScript package scripts, PostgreSQL driver, runtime validation, strict typechecking and native Node test runner via tsx.
- [x] Add dedicated local PostgreSQL Compose services: persistent development database and isolated disposable test database; loopback-only published ports.
- [x] Write one failing contract test in `test/signals.test.ts`: a provisioned Source submits a raw Signal and can retrieve the accepted receipt without content exposure.
- [x] Add `src/contracts.ts`, `src/signals.ts`, `src/server.ts`, `src/main.ts`, and versioned SQL under `migrations/`. Implement validated intake, bearer-bound identity, durable insert and receipt lookup. Add migration runner.
- [x] Run `npm run typecheck` and `npm run test:signals`.

## Task 2: retry and Source revision invariants

- [x] One red/green cycle at a time: retry same key, reject changed payload, deduplicate same item/revision under a new key, preserve alias key bindings, accept new revisions, handle missing revisions and changed cursors.
- [x] Use PostgreSQL uniqueness constraints and a transaction; serialize writes within each tenant/origin so independent instances cannot race to create duplicate Signals or conflicting key bindings. No in-process lock.
- [x] Test concurrent submissions through independent HTTP servers and persistence after restarting the service.
- [x] Run typechecking and the focused contract test file regularly.

## Task 3: trust boundary, local operation and independent proof

- [x] Contract tests for Consumer/user origins, all fidelity values, invalid/unknown fields, forged origin, missing/invalid credentials, cross-tenant and cross-origin receipt isolation, malformed and oversized requests.
- [x] Add local run instructions and explicit API contracts in `docs/development.md`; preserve existing README anchor, update progress without claiming managed production readiness.
- [x] Add CI for typechecking and API tests against PostgreSQL. Do not add a separate evaluation harness.
- [x] Run full `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`, and a startup smoke check.
- [ ] Invoke `code-review`: fresh independent Standards and Spec/security/concurrency reviewers, no implementation delegation. Pin the starting commit and include uncommitted new files in the reviewed patch if not yet committed.
- [ ] Fix material findings with regression tests, rerun sufficient proof, record review results and verification evidence in #31, and commit work on the current branch. Do not push.

## Execution ledger

- Plan created after user approval. No runtime or existing test suite was present. Docker and Node 22 are available; existing unrelated containers must not be touched.
- Task 1: first API test failed with 404 instead of 202, then passed after durable intake and lookup were implemented. Typechecking exposed an ES2023 library mismatch for Node's `String.isWellFormed`; the compiler target was corrected to ES2024.
- Task 2: retry, conflicting-key and revised-item redeliveries each failed before their implementation. PostgreSQL transactions, alias bindings and revision uniqueness made them pass. Additional revision, independent-instance concurrency and restart scenarios passed.
- Task 3 implementation: 16 canonical API contract tests pass. Typecheck, build, dependency audit and diff checks pass. A compiled-process smoke check verified migrations applied twice, authenticated intake, process restart, durable receipt/retry, graceful shutdown and fail-closed startup.
- Test isolation refinement: each suite uses its own random PostgreSQL schema, preserving separate test/development databases without global truncation. Bootstrap credentials are local provisioning, not managed account authentication. No implementation was delegated; review remains pending.
