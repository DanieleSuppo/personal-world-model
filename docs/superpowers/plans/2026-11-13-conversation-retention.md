# Conversation Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete #32 with durable, recoverable acquired content and explicit privacy deletion.
**Architecture:** Extend the Signal ledger, guard retention in PostgreSQL and expose tenant-user-only recovery/deletion. Keep exact-revision consolidation in #35.
**Tech Stack:** Node.js >=22, TypeScript, PostgreSQL, existing pg/zod and node:test.
**Spec:** docs/superpowers/specs/2026-11-13-conversation-retention-design.md

## Global Constraints
- No new dependencies, applied migration edits, destructive rollback, production database use or content in operational receipts.
- Keep all acquired content and fidelity unchanged until explicit deletion; receipt state never authorizes cleanup.
- Native implementation only; use subagents solely for final review. Commit branch and open PR after clean review.

## Review Focus
- Existing installations: additive upgrade preserves content and retry identity.
- Cross-tenant/user authorization: inaccessible content cannot be recovered or deleted.
- Duplicate delivery after deletion: tombstones must prevent resurrection.
- Concurrent new revisions: deleting one revision must not clear another.
- Failed processing: rollback and receipt transitions must not authorize cleanup.

### Task 1: Retention lifecycle boundary
**Files:** modify src/signals.ts, src/server.ts, src/main.ts, docs/development.md, README.md; create migrations/004_signal_retention.sql, test/retention.test.ts. Keep the two small retention operations with the existing Signal row/receipt mapping in src/signals.ts rather than splitting its ownership.
**Interfaces:** existing submitSignal/getReceipt stay compatible; getRetainedSignal(pool, principal, id) and deleteSignalContent(pool, principal, id) return owner-only retained data or undefined.
- [x] Slice 1 RED: add HTTP recovery test across independent server/pool restart for all fidelity values and duplicate revisions. Run `npx tsx --test test/retention.test.ts`, expect missing route 404.
- [x] Slice 1 GREEN: implement owner-only GET over existing ledger. Run focused tests and typecheck.
- [x] Slice 2 RED: attempt ordinary SQL deletion/replacement and committed receipt cleanup; prove HTTP retains content after rejected writes and rollback.
- [x] Slice 2 GREEN: add additive retention migration, immutable fingerprint and pending retention guard. Run focused tests and typecheck.
- [x] Slice 3 RED: user deletion must clear content without claiming consolidation; retries, aliases and restart cannot restore it; deny other tenants/origins and protect concurrent revisions.
- [x] Slice 3 GREEN: implement explicit deletion and digest-based duplicate comparison. Run focused tests and typecheck.
- [x] Verify upgrade from migrations 001-003 with real retained input and retry; rerun migration idempotently.
- [x] Update docs, startup schema check and handoff. Run `npm run typecheck`, focused tests, `npm test`, `npm run build`, `git diff --check`.
- [ ] Commit, run final independent Standards/Spec review, fix material findings with regression tests, record issue evidence and create PR.
