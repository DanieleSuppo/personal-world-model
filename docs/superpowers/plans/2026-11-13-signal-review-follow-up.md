# Follow-up: approved #31 review refinements

> Use superpowers:executing-plans directly. The user authorized the previously deferred refactoring and minor improvements. Implementation remains in this session; subagents may perform independent review only.

Review base: `60c5143`. Scope: the two Standards suggestions and the generic-error classification finding from the completed #31 review. No new feature, database migration, dependency, authentication mechanism or endpoint is introduced. Optional method-handling changes are not part of this follow-up.

## Behavior boundary and approach

Keep receipt contents, success and validation responses, authorization, tenant/origin isolation, idempotency, transaction order and persistence unchanged. Consolidate the existing principal-to-SQL-scope mapping within `src/signals.ts` rather than introducing a new domain abstraction. Give test HTTP startup/shutdown one helper; that helper does not own externally supplied pools.

The one intentional response change distinguishes unexpected internal/configuration/programming faults (`500`, `internal_error`) from recognized storage connectivity or transient PostgreSQL faults (`503`, `storage_unavailable`). Preserve content-blind error responses and add a static internal-error diagnostic without logging raw exceptions, content or credentials. Classify PostgreSQL SQLSTATE/system codes and the installed driver's known uncoded connection/timeout errors; unknown errors fail closed as internal, not automatically retryable.

Test seam remains the already approved canonical HTTP API with actual PostgreSQL. Fixture setup may vary database connectivity or use an unmigrated isolated search path; assertions remain against HTTP results. Do not mock Signal internals.

## Tasks

- [x] Establish baseline: strict typecheck and existing 18 API contract tests.
- [x] Consolidate tenant/origin SQL scope and test server fixtures; rerun the unchanged contract suite.
- [x] Add failing API coverage for deterministic storage/schema faults and closed-pool misuse returning 500; prove real connectivity loss still returns 503. Implement narrow classification and safe diagnostics.
- [x] Update error documentation, run full tests/typecheck/build/diff checks, obtain independent review and commit locally. No push.
- Append completion evidence to #31 after the final documentation commit.

## Execution ledger

- Baseline: clean working tree on `main`, two existing local commits. Typecheck and 18/18 API tests pass before structural edits.
- Structural edits: SQL reads and writes share one typed principal-scope mapping. Test HTTP instances share startup/shutdown while callers retain pool ownership. The unchanged 18-test suite and typecheck pass afterward.
- Error-classification red: closed-pool misuse and a real PostgreSQL missing-schema fault returned 503 instead of the required 500. Real connection loss still returned 503.
- Error-classification green: recognized SQLSTATE/system codes and exact uncoded pg connection messages retain 503; unknown faults now return content-blind 500 plus a static diagnostic. Both GET and POST paths are covered without mocking Signal internals.
- Verification before independent review: 20/20 full-suite tests, typecheck, build and diff whitespace checks pass. No migration, dependency or production deployment changes. Two independent reviewers confirmed the requested refactoring and public error distinction, without scope creep or content leakage.
- Review adjudication: the claim that no uncoded driver message was tested was disproved by a direct probe: the existing disconnecting-peer fixture produces `Connection terminated unexpectedly` with no code. Deliberately ended pg clients remain internal faults (`client._ending`), like ended pools. Cancellation/timeouts remain potentially transient; documentation now requires bounded backoff and finite retry limits. Added the remaining named network-down/abort syscall codes.
- Rollback review led to a real regression test: terminating the PostgreSQL backend during intake raised an uncaught connection error during rollback. The fix listens for checked-out client connection errors, preserves the primary operation error when rollback fails, and discards the broken client. The API now returns 503 and accepts/reuses the original key after recovery. Test assertions remain at HTTP; an isolated fixture trigger causes actual backend termination.
- After the cleanup fix: 21/21 contract tests and typechecking pass. Focused final cleanup review also passed: no listener leak, no unsafe client reuse, original PostgreSQL error preserved, and successful/conflicting intake behavior unchanged. The reviewer independently reproduced the pre-fix failure and confirmed the new regression test passes.
- A low-severity observation concerned the pre-existing migration runner, outside this follow-up: its connection-drop diagnostic/cleanup does not yet use the intake pattern. Narrowed the documentation claim explicitly to Signal intake rather than implying all transactions are covered. Migration changes and optional per-outage logging are not included.
- Final state: all three user-requested review refinements are implemented. No unaddressed finding in the changed intake behavior; the known migration-runner observation is recorded for separate work.
