# Personal World Model

> **Your context follows you.**

Personal World Model is an exploration of a user-owned personal context layer that can persist across AI assistants, applications, and devices.

The core idea is simple: the intelligence you use can change, while the persistent understanding of who you are should remain yours.

A person may use ChatGPT today, Claude tomorrow, a local model next week, and specialized travel, shopping, device, or home agents later. Each system can build its own partial memory of the user. Personal World Model explores the opposite model: a persistent personal representation that is independent of any single assistant and selectively available to the AI or application the user chooses.

This project is intentionally **not** defined as a better chat memory. The goal is a richer, evolving model of the person and their world: what is known today, what is strongly suspected, in which context it applies, how it changes over time, and what may safely be used for a particular purpose.

## Product thesis

A normal assistant memory mainly asks:

> What has this user told me that may be useful later?

A Personal World Model asks:

> What do we know about this person and their world today, and what part of that understanding is appropriate for this task?

The model may include facts, relationships, preferences, contextual preferences, habits, routines, skills, goals, possessions, subscriptions, experiences, places, events, current circumstances, observed patterns, and high-confidence hypotheses.

The system should learn broadly and disclose narrowly.

**Learn broadly. Remember broadly. Disclose narrowly.**

Information is not discarded merely because it appears unlikely to be useful today. A mundane detail may become relevant later when combined with new signals. Relevance is primarily a serving concern, not an ingestion filter.

## What the user should experience

The Personal World Model is not meant to be a dashboard the user continuously maintains.

Its primary experience is invisible:

1. the user connects one existing AI history and gets a deliberately incomplete initial bootstrap;
2. additional AI histories, email, and calendar progressively deepen the model;
3. connected sources continue to enrich it over time;
4. a new AI can ask an open question such as “What should I know about this person for this task?”;
5. the Personal World Model returns a rich, task-specific briefing rather than dumping the full profile;
6. the user can correct or revise the model conversationally from any connected AI.

The desired effect is not “look at my personal knowledge graph.” It is:

> **How does this new AI already know me so well?**

## Core product principles

### The model belongs to the user, not to an assistant

No AI consumer is the master copy. ChatGPT, Claude, Gemini, local models, and specialized agents are replaceable consumers of the Personal World Model.

Consumers may also provide signals from their interactions, but they are not trusted authorities over the model. Any semantic update to personal knowledge is the responsibility of the Personal Context Engine operated by this project.

### Broad learning, selective use

If the system can reasonably learn something about the user, it may retain it even when the information seems obscure or unlikely to be useful.

The Context Serving Engine is responsible for selecting what is relevant for a task and what may be disclosed under the current purpose and sensitivity policy.

### Facts and strong hypotheses are different

The model must not collapse every inference into a fact.

It may retain high-confidence hypotheses when they are useful for future reassessment or for cautious guidance. A sensitive hypothesis may influence a response without ever being disclosed to the consumer as a claim about the person.

For example, a system may have enough private signals to suspect a temporary condition. Instead of leaking that hypothesis, it may advise a consumer to verify whether any current constraints should be considered.

### Context is primarily pulled, not dumped

Consumers should normally ask open questions about the task they are performing rather than receiving a giant profile in every prompt.

The preferred pattern is:

```text
open task query
    -> rich contextual briefing
    -> optional targeted follow-up
```

The first response should be intentionally rich enough to minimize unnecessary ping-pong and may include useful adjacent context the consumer did not know to request.

Responses should favor natural-language briefings, accompanied only by the minimum machine-readable structure required for deterministic constraints or policy handling.

### Purpose limitation is continuous

Authorizing a consumer does not give that consumer unrestricted access to the complete model.

Access is evaluated in the context of the consumer, the current purpose, relevance, sensitivity, and the form of answer that can safely satisfy the request.

The system may answer a question using private information without exposing the underlying information itself.

### User control without constant administration

The product should be low-friction by default. The user should not be asked to approve every learned detail or every context query.

The user must nevertheless be able to say things such as:

- “That is no longer true.”
- “That only applies when I travel with my children.”
- “You misunderstood me.”
- “Reconsider what you know about me on this topic.”
- “Do not use this kind of information with external applications.”

Corrections trigger semantic reassessment rather than simplistic CRUD operations over memory entries.

## Knowledge lifecycle

The project currently distinguishes conceptually between:

- **signals** — raw or partially interpreted material from a source;
- **observations** — potentially meaningful things recognized by the system;
- **candidate interpretations** — temporary reasoning, which may remain uncertain;
- **personal knowledge** — sufficiently reliable conclusions represented in the model;
- **high-confidence hypotheses** — strong but not factual conclusions that remain explicitly distinct from knowledge;
- **Episodes** — contextualized experiences, events, decisions and outcomes that need not imply a generalized assertion;
- **Personal Directives** — attributable explicit user instructions, distinct from inferred preferences and subject to scope, correction and optional expiry;
- **Disclosure Ledger** — durable record of which versioned information was delivered to each Consumer, including lineage that prevents agent echoes from becoming independent evidence.

Knowledge may later be reinforced, weakened, contextualized, corrected, or superseded as the person and their circumstances change.

The system retains contextual Episodes, compact lineage and selected excerpts for later reassessment. All conversation material actually acquired, whether full transcript, excerpt or summary, remains durably available until successful Dreaming for its covered revision. The model never claims to possess conversation portions it did not receive and is not a permanent duplicate archive of every source.

Disconnecting a source stops future learning from that source; it does not automatically erase what the system has already learned.

## Bootstrap and continuous enrichment

The first useful bootstrap is deliberately incremental.

A plausible recommended path is:

1. one existing AI conversation history;
2. another AI history;
3. email;
4. calendar;
5. additional sources over time.

No step represents “100% complete.” Each source adds another perspective on the person, and the model continues to evolve after onboarding.

AI platforms expose different integration capabilities. When possible, the system should ingest raw conversation context or faithful excerpts. When a platform cannot provide that, an AI-generated interaction summary may be accepted as a lower-authority signal and independently interpreted by the Personal Context Engine.

Email and calendar can be connected directly to the Personal World Model and are natural candidates for continuous enrichment.

## Privacy and deployment direction

The desired product model is inspired by user-controlled infrastructure such as Bitwarden:

- a managed service should be the easiest default experience;
- self-hosting should be an official, first-class alternative;
- the model should be portable and exportable;
- the service operator should not have standing access to the user's Personal World Model.

The subsequent [technical SPEC #16](https://github.com/DanieleSuppo/personal-world-model/issues/16) resolves the initial managed/self-hosted trust boundary: managed runtime processing may access only the minimum content needed for an authorized operation, with service-controlled tenant-separated runtime keys and content-blind human support; encrypted portable export and an independent self-hosted deployment are specified. These are design requirements, not proof of deployed cryptography, confidential compute or operational compliance. A particular TEE/confidential-compute implementation remains outside the initial decision.

## Initial wedge

The initial wedge is **cross-AI continuity with user-controlled selective context**.

A compelling demonstration should show:

1. a Personal World Model bootstrapped from multiple personal sources;
2. a second AI that has never interacted with the user producing a surprisingly personalized answer immediately;
3. new information or a correction learned after that interaction;
4. the first AI subsequently benefiting from the updated model;
5. sensitive or uncertain knowledge improving guidance without being unnecessarily disclosed.

This is deliberately more than portable chat memory. The persistent state belongs to the user, evolves independently of assistants, and mediates what each consumer should know for a particular task.

## Initial users

The first users are likely to be heavy AI users and power users who already switch between multiple assistants and feel the cost of repeatedly rebuilding personal context.

Privacy-conscious and local-AI users are also natural early users, particularly for the self-hosted distribution path.

The project does not assume immediate mainstream adoption.

## Non-goals for the first version

The initial product is not intended to be:

- a general-purpose personal assistant;
- a personal knowledge graph dashboard;
- a second email, photo, or document archive;
- a simple portable-memory MCP server;
- an application-specific travel or shopping profile;
- an assistant that requires constant manual confirmation of learned details;
- a system that trusts third-party consumer LLMs to update authoritative personal knowledge;
- a system that exposes the entire personal model to every connected consumer.

## Memory architecture (decisions 2026-11-11)

The Personal World Model retains meaningful **episodic memory** (experiences, events, decisions and outcomes) alongside evolving Personal Knowledge and explicitly qualified hypotheses. It also distinguishes **Personal Directives** from inferred preferences and ordinary facts: a receiving harness decides whether and how to apply a user-origin Directive; the Personal World Model never claims system-instruction authority.

Acquired conversations remain durably available **as actually received until successful, durable Dreaming/consolidation**. A failed or partial attempt cannot authorize ordinary raw cleanup. Subsequent retention follows privacy/deletion policy, preserving useful episodes, observations and lineage. Dreaming complements incremental learning and supports bounded reassessment.

A **Disclosure Ledger** records which versioned information was supplied to which Consumer, when and for what purpose. An agent repeating information previously received from the model does not provide independent corroboration; explicit new user evidence is treated separately where provenance supports it.

The Context Serving Engine can use lightweight or deeper bounded episodic retrieval independently of Context Cards. **Context Cards** are compact, reusable, topic-oriented **derived projections**, not authoritative memory; they can be invalidated and regenerated, and never bypass per-request purpose and sensitivity checks. They may have a visual representation in the future, but none is required now.

A user-associated **skill/procedure catalogue** is discoverable through the canonical API and compatible adapters, including MCP where supported. This does not install or execute skills automatically. PostgreSQL remains the sole authoritative ledger, with rebuildable retrieval and Context Card projections. The complete product contracts are in [SPEC #16](https://github.com/DanieleSuppo/personal-world-model/issues/16) and [PRD](docs/PRD.md).

## Status

**Discovery, Wayfinder and the revised technical SPEC are delivered; implementation has not started (2026-11-11).** [Wayfinder map #1](https://github.com/DanieleSuppo/personal-world-model/issues/1) and decisions #2-#15 are closed. [SPEC #16](https://github.com/DanieleSuppo/personal-world-model/issues/16) remains open as the implementation parent.

The original implementation issues **#17-#30 were closed as superseded**, not completed. The approved Matt Pocock `to-tickets` workflow produced **27 replacement/refinement tracer-bullet tickets #31-#57**, with acceptance criteria and blocking references. These are planned work, not shipped features. There is no product runtime or demonstrated cross-AI integration yet.

The revised specification covers canonical Signals, episodic and semantic records, durable Dreaming, disclosure lineage, Directives, derived Context Cards, skill discovery, privacy mediation, ChatGPT MCP, Anthropic, ChatGPT export, Calendar, managed trust, encrypted portability and independent self-hosting.

**Immediate unblocked ticket:** [#31, Receive idempotent Signals with explicit origin and receipts](https://github.com/DanieleSuppo/personal-world-model/issues/31). The final integrated contract milestone is [#54](https://github.com/DanieleSuppo/personal-world-model/issues/54).

## Development workflow and next handoff (2026-11-11)

Use the installed Matt Pocock skills and this repository's GitHub Issues tracker ([AGENTS.md](AGENTS.md), [issue-tracker configuration](docs/agents/issue-tracker.md), [domain guidance](docs/agents/domain.md)). The [PRD](docs/PRD.md) defines product intent; [SPEC #16](https://github.com/DanieleSuppo/personal-world-model/issues/16) and issues #31-#57 define the current implementation scope. Follow the installed skills' standard workflow; this handoff is not a replacement.

- **Completed:** product discovery -> `/wayfinder` (#1-#15 closed) -> revised SPEC #16 -> approved `to-tickets` (#31-#54 published, refined into #55-#57 for single-session scope).
- **Next when a WIP lane is available:** run standard `/implement #31`, then follow genuine blocking dependencies recorded in each issue. Verify each tracer-bullet behavior at the canonical API seam.
- **Product milestone:** actual two-consumer continuity, episodic recall, corrected Directives, Dreaming, non-independent echo handling and controlled disclosure (#54).
- **Boundaries:** no generic memory framework, extra research or benchmark programme as prerequisites. MCP, Anthropic, Calendar, managed trust and self-hosting remain specified until implemented and demonstrated.
