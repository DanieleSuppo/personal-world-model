# Personal World Model — Product Requirements Document

**Status:** Discovery consolidated; ready for specification/design exploration  
**Project name:** Personal World Model  
**Repository:** `personal-world-model`  
**Working product thesis:** *Your context follows you.*

---

## 1. Executive summary

People are beginning to use multiple AI systems in parallel: general assistants, local models, coding agents, device assistants, travel and shopping agents, browser and computer agents, and increasingly specialized applications.

Each of these systems may build its own partial memory of the user. That creates duplicated onboarding, fragmented personal knowledge, inconsistent representations, and growing dependence on whichever assistant currently owns the richest history.

Personal World Model explores a different architecture:

> **Separate the intelligence a person uses from the persistent understanding of who that person is.**

The product maintains a user-owned, evolving representation of the person and their world. AI systems and applications may query that representation for a particular purpose and receive the context that is useful and appropriate for the current task.

The Personal World Model is not itself primarily an assistant. Its value is that a new assistant can behave as if it already has a long relationship with the user, without requiring the entire personal model to be copied into that assistant.

The first wedge combines two needs that already exist for heavy AI users:

1. **cross-assistant continuity** — do not make the user repeatedly explain themselves when switching AI;
2. **controlled disclosure** — do not solve continuity by giving every AI an unrestricted copy of the user's complete personal profile.

The product should learn broadly, retain broadly, and disclose narrowly.

---

## 2. Problem

### 2.1 Fragmented personal understanding

A person can build years of conversational history with one assistant and then receive a better model, a new provider, a local model, or a specialized agent that knows nothing about them.

The current workaround is usually one of:

- start over;
- maintain separate memories in each assistant;
- manually paste profile/context documents;
- export and import textual memories;
- accept lock-in to the assistant that currently knows the user best.

All of these treat personal context as something owned by the intelligence consuming it.

### 2.2 Portable memory is not enough

Copying a list of remembered facts between assistants addresses only the shallowest version of the problem.

A useful personal representation needs to distinguish, over time, between things such as:

- explicit facts;
- observed behavior;
- preferences;
- contextual preferences;
- relationships;
- habits and routines;
- current circumstances;
- temporal changes;
- patterns learned from multiple signals;
- high-confidence hypotheses that are useful but must not be presented as facts.

The system should be able to represent that a person once behaved one way, later changed, and now behaves differently without treating one period as an error.

### 2.3 Continuity creates a privacy problem

A universal personal profile is dangerous if continuity means every connected AI receives everything.

The system therefore needs to mediate between:

- what it knows;
- what is relevant to a specific task;
- what a specific consumer is authorized to obtain;
- what may be used internally without being disclosed;
- what is too sensitive or uncertain to expose directly.

### 2.4 Manual profile maintenance defeats the product

A personal model that requires users to curate hundreds of fields, approve every inferred preference, inspect a knowledge graph, or continuously resolve memory conflicts becomes another administrative system.

The primary experience must instead be the effect of being known.

---

## 3. Product vision

A person should be able to replace their assistant without replacing their personal context.

The desired experience is:

> I connect a new AI and it already understands the relevant parts of me. It keeps learning as my life changes. It does not need me to maintain a profile, and it does not give every application everything it knows.

The Personal World Model should be largely invisible during normal use.

A successful user reaction is closer to:

> “How does this new AI already know me so well?”

than to:

> “Look how complete my personal knowledge graph is.”

---

## 4. Initial target users

### 4.1 Primary target hypothesis

The first user is a **heavy multi-AI user / power user** who:

- already uses two or more assistants or models;
- has meaningful conversational history with at least one AI;
- regularly switches tools based on model quality or task;
- notices the cost of repeatedly rebuilding context;
- is comfortable connecting personal data sources when the value and trust model are credible.

This user feels the problem today rather than only anticipating it in a future agent ecosystem.

### 4.2 Secondary early audiences

Potential secondary early users include:

- local-AI users;
- privacy-conscious users;
- developers and technical power users;
- knowledge workers with rich AI histories;
- users who deliberately avoid assistant lock-in.

The product does not assume immediate mainstream consumer adoption.

---

## 5. Jobs to be done

### Primary job

> When I use a new or different AI, let it understand the relevant parts of me without making me rebuild my personal context and without transferring my entire identity to that AI.

### Supporting jobs

The user should be able to:

- connect multiple AI systems to the same evolving personal understanding;
- bootstrap that understanding from existing personal sources;
- let the model continue learning without manual profile maintenance;
- correct it naturally when it misunderstands something;
- let an AI obtain broad, useful task context through a small number of queries;
- prevent a consumer from receiving unrelated or unnecessarily sensitive knowledge;
- revoke a consumer without losing the underlying Personal World Model;
- disconnect a source without automatically forgetting everything previously learned from it;
- move between managed hosting and self-hosting without changing the conceptual product.

---

## 6. What is a Personal World Model?

The term is intentionally broader than “memory.”

A Personal World Model is the persistent representation of what the system currently understands about the person and their world.

It may represent, without requiring a closed ontology in advance:

- identity and relatively stable facts;
- people and relationships;
- household and family context;
- preferences and tastes;
- contextual preferences;
- habits and routines;
- goals and constraints;
- possessions and subscriptions;
- skills and experiences;
- interests;
- places and travel patterns;
- purchases and products owned;
- food preferences;
- behavioral patterns;
- events and changing circumstances;
- current context;
- other knowledge that becomes available over time.

### 6.1 Open-world principle

The ingestion process should not discard a piece of knowledge merely because the product team did not predict its category or because it appears unlikely to be useful.

If the system can reasonably know something, it should generally be able to retain it.

A seemingly trivial detail may become useful only after another signal arrives months later.

Therefore:

> **Learn broadly. Remember broadly. Disclose narrowly.**

Relevance belongs primarily to context serving, not to deciding whether a valid piece of personal knowledge deserves to exist.

---

## 7. Epistemic model

The product must avoid collapsing all personal information into undifferentiated “memories.”

At the product-semantics level, the discovery currently distinguishes:

### 7.1 Signal

Raw or partially interpreted material obtained from a source.

Examples:

- a calendar event;
- an email;
- a raw conversation turn;
- a verbatim excerpt sent by an AI;
- an AI-generated interaction summary;
- a purchase event.

### 7.2 Observation

Something potentially meaningful the Personal Context Engine recognizes in one or more signals.

Observations may retain compact supporting material, such as a small excerpt or synthetic description, when useful for later reassessment.

### 7.3 Candidate interpretation

Temporary reasoning about what observations might mean. Candidate interpretations are not automatically part of the stable Personal World Model.

### 7.4 Personal knowledge

A conclusion sufficiently reliable to be represented as something the system currently knows about the person or their world.

Knowledge may be explicit, observed, imported, inferred, contextual, temporal, or derived from combinations of these.

### 7.5 High-confidence hypothesis

Some conclusions may become highly plausible and useful before they are appropriate to state as facts.

These hypotheses may remain in the model explicitly as hypotheses when they are sufficiently supported to improve future understanding or behavior.

They must not silently become factual claims.

A high-confidence hypothesis may:

- help interpret later evidence;
- accelerate future confirmation or rejection;
- trigger cautious guidance;
- influence selective computation;
- remain undisclosed when sensitivity or uncertainty makes direct disclosure inappropriate.

For example, a sensitive personal hypothesis may justify advising a restaurant agent to verify current dietary needs without revealing the underlying hypothesis.

### 7.6 Independent dimensions

The product should preserve conceptually distinct dimensions rather than forcing knowledge through one linear trust ladder.

Relevant dimensions include:

- epistemic nature/origin;
- level of support or confidence;
- user confirmation, disagreement, or correction;
- temporal validity and freshness;
- contextual applicability;
- sensitivity;
- contradiction and supersession state.

An inferred pattern can become strongly supported without pretending the user explicitly stated it. An explicitly stated preference can become stale without ceasing to have been genuinely stated in the past.

The exact schema is a specification decision, not a PRD requirement.

---

## 8. Change, correction, and forgetting

A person changes. The Personal World Model must therefore be evolutionary rather than a static profile.

Knowledge may be:

- reinforced;
- weakened;
- refined;
- restricted to a narrower context;
- contradicted;
- corrected;
- superseded;
- marked stale or historical;
- reassessed together with related knowledge.

### 8.1 Conversational correction

The primary correction experience is natural language through a connected AI, not direct manipulation of memory records.

The user may say:

- “That is no longer true.”
- “That only applies when I travel with my children.”
- “You misunderstood me.”
- “Things have changed; reconsider what you know about how I travel.”

The consumer conveys the interaction signal, but the Personal Context Engine performs the semantic reassessment.

### 8.2 Corrections are not equivalent to deletion

A previous conclusion may have been correct in an earlier period.

The system should be capable of representing:

> previously true -> circumstances changed -> different current understanding

rather than rewriting history as if the previous state had never existed.

### 8.3 Source disconnection

Disconnecting a source stops future learning from that source.

It does not automatically delete knowledge already learned from it.

The user thinks in terms of whether a belief about them is still correct, not in terms of which historical data provider originally contributed to it.

---

## 9. Evidence and lineage

The Personal World Model is not intended to be a forensic evidence system.

The user does not need to inspect a chain of custody proving that a preference originated in a particular obscure email.

The product should instead maintain **enough internal derivation context to preserve quality**.

This may include:

- compact observations;
- selected small excerpts;
- broad source type;
- the relationship between observations and resulting knowledge;
- indications of reinforcement, contradiction, or change.

The system should avoid obsessively duplicating complete emails, entire AI histories, documents, or every intermediate observation when a compact representation is sufficient.

However, consolidation must not prevent later reassessment. New evidence may make old signals meaningful in ways that were not apparent when those signals first arrived.

The exact balance between raw excerpts, observations, aggregates, historical windows, and reprocessing is deliberately deferred to specification/design.

---

## 10. Acquisition and bootstrap

### 10.1 Minimum bootstrap

The product should be able to start from a single existing AI conversation history, even though this is explicitly an incomplete representation.

The goal is to create value quickly rather than require a complete onboarding ceremony.

### 10.2 Recommended progressive bootstrap

A plausible initial wizard progressively offers:

1. first AI conversation history;
2. second AI conversation history;
3. email;
4. calendar;
5. additional sources later.

This is not a completion meter. Adding sources broadens the model, but there is no meaningful “100% complete.”

The wizard should communicate expected qualitative knowledge gains rather than inventing unsupported numerical percentages.

### 10.3 Continuous enrichment

After bootstrap, connected sources should continue to update the Personal World Model.

The model is not a one-time import artifact.

### 10.4 AI conversation sources

AI platforms provide different levels of access to conversation history and current interaction context.

The ingestion contract must tolerate multiple qualities of input:

1. **direct/raw interaction context**, when available;
2. **faithful/verbatim excerpts**, when the consumer can pass relevant turns;
3. **consumer-generated summaries or observations**, when raw context is unavailable.

A consumer summary is useful but is not equivalent in authority to first-party raw interaction text.

A third-party LLM never becomes authoritative over the Personal World Model merely because it reported an interpretation.

### 10.5 Email and calendar

Email and calendar are high-value early sources because they can be connected directly to the Personal World Model and can provide continuous signals independent of an active AI conversation.

Calendar is not only a source of explicit preferences. It can provide important temporal and situational grounding for current context, routines, relationships, travel, and changing circumstances.

---

## 11. Learning Engine responsibility

A central product decision is that the Personal World Model is built by **our Personal Context Engine**, not by whichever consumer LLM the user happens to be using.

> **Consumers can use the model. Only the Personal Context system builds the model.**

This is required so that product quality is not dependent on whether the user chooses a frontier assistant, an old model, or an experimental local model.

Consumer AIs may provide signals, including interaction summaries, but they do not directly mutate authoritative personal knowledge.

The Context Engine is responsible for interpreting those signals and deciding whether they add, reinforce, weaken, contextualize, contradict, supersede, or fail to change the model.

### 11.1 Reprocessing is allowed

The architecture must not assume that each source item is semantically processed once and can then be forgotten.

A new signal may make older observations or source material newly informative.

For example, ten purchases considered separately may be inconclusive; an eleventh may reveal a coherent life change that requires reconsidering the earlier ten as a group.

How to implement historical windows, deltas, compaction, batch processing, and bounded reprocessing is deliberately deferred to the design phase.

---

## 12. Context consumption

The preferred consumption model is primarily **pull-based**.

A consumer should know that a Personal World Model exists and query it when the current task could benefit from personal context.

The model should not inject a complete profile into every conversation.

### 12.1 Open-query-first

The primary query should be broad and task-oriented, for example:

> “I am planning a family weekend in Barcelona. What should I know about this person to do this well?”

The consumer should not be required to already know which personal fields exist.

The first response should be intentionally rich and include:

- clearly relevant context;
- useful adjacent context;
- consequential details the consumer may not have known to ask about.

The objective is to minimize repeated small retrieval calls and unnecessary ping-pong.

Targeted drill-down remains available when additional precision is genuinely useful.

### 12.2 Output form

The preferred response is hybrid but strongly oriented toward natural language:

- a rich briefing that an AI can immediately reason over;
- minimal structured data only where deterministic handling is valuable, such as hard constraints, people involved, policy restrictions, or similar elements.

Consumers should not need to understand the internal ontology of the Personal World Model.

---

## 13. Modes of use

The model can create value in at least three ways.

### 13.1 Selective disclosure

The consumer receives relevant personal knowledge together with whatever epistemic qualification is useful.

Example:

> “When travelling with children, this person tends to favor direct flights when the price difference is moderate.”

### 13.2 Selective computation

The Personal Context Engine may use private information internally to answer a question without exposing all underlying data.

Example:

> “Among these options, A and C are more compatible with the user's usual discretionary spending patterns.”

The consumer does not necessarily receive income or financial history.

### 13.3 Protective guidance

Sensitive or high-confidence hypothetical knowledge may influence guidance without being disclosed.

Example:

> “Before finalizing the restaurant choice, verify whether there are any current dietary preferences or constraints to consider.”

The consumer need not learn why the Personal Context Engine considers that check worthwhile.

A major product principle follows:

> **The Personal World Model may know more than it reveals.**

---

## 14. Authorization, purpose, and sensitivity

### 14.1 Hybrid authorization

The user authorizes an application or AI as a continuing consumer, but that authorization is not equivalent to full-profile access.

Each context request is still evaluated against:

- consumer identity;
- declared/current purpose;
- relevance;
- sensitivity;
- type of knowledge;
- possible non-disclosing alternatives.

The desired runtime behavior is conceptually:

> **automatic -> constrained -> ask -> deny**

Most ordinary interactions should remain automatic. The user must not become a human firewall approving every query.

### 14.2 Purpose is not trusted blindly

A consumer cannot obtain everything by declaring a generic purpose such as `help_user`.

The Personal Context Engine must interpret what is actually being requested and apply its own policy.

### 14.3 Sensitivity model

Sensitivity should combine:

- product-level default safeguards;
- user-specific sensitivity preferences;
- situational/contextual sensitivity.

Some categories should receive strong default protection, while the user remains able to make the system more restrictive.

Exact taxonomy and policy semantics are deferred to specification.

---

## 15. User experience and control

### 15.1 The World Model is not a destination

The primary UX is not a browsable knowledge graph, profile editor, or administrative dashboard.

The user normally experiences the Personal World Model through the AI and applications that use it.

When the user wants to inspect it, the preferred interface is conversational:

> “What do you know about me when I travel?”

The answer should explain the model's current understanding in human terms, not expose internal identifiers, graph nodes, or source provenance.

### 15.2 Access management remains visible

A lightweight management surface is still required for questions such as:

- which consumers are connected;
- what general permissions they have;
- revoke access;
- connect/disconnect sources;
- manage hosting/security settings;
- export or move the model.

This is management of access to the model, not manual maintenance of the model itself.

---

## 16. Privacy, ownership, and deployment

Privacy is an architectural requirement, not only a policy statement.

### 16.1 Desired trust promise

The current target is:

> **The service operator should not have standing access to the user's Personal World Model.**

The exact technical mechanism remains open because the system must perform inference and retrieval over personal knowledge, unlike a passive encrypted vault.

### 16.2 Deployment model

The desired product distribution is inspired by trusted personal infrastructure such as Bitwarden:

- **managed service** as the easiest default;
- **self-hosting** as a first-class supported alternative;
- portable/exportable personal state;
- common conceptual protocol and behavior across both deployment modes.

Open-source or source-visible distribution is a strong hypothesis to evaluate, not yet a final licensing decision.

### 16.3 Storage trust vs compute trust

Persistent storage and active reasoning are separate trust problems.

Potential approaches to evaluate later include:

- user-controlled encryption keys;
- encrypted cloud state;
- local compute;
- confidential compute / trusted execution environments;
- hybrid compute;
- self-hosted inference;
- configurable local/open-weight models for self-hosted installations.

The PRD deliberately does not claim Bitwarden-style zero knowledge until an architecture can genuinely support that promise while still performing required reasoning.

---

## 17. Model independence and cost

The managed product cannot require ordinary consumer users to supply API keys.

The Personal Context Engine must use models and algorithms controlled by the product so that its behavior can remain consistent independently of the model used by the consumer.

This creates an important cost constraint.

The system should be designed so that not every source event requires expensive frontier-model inference. Deterministic processing, cheaper models, aggregation, batching, and selective escalation are all valid implementation strategies to explore.

However, the free tier must not become epistemically unreliable merely because it is cheaper.

A plausible commercial distinction is processing freshness and budget rather than a deliberately bad model:

- free: periodic/batched learning;
- premium: more frequent or near-continuous learning and potentially deeper processing.

Exact schedules and quotas should remain implementation/product-packaging details rather than hard-coded promises at this stage.

---

## 18. Initial wedge and demonstration

The first wedge is:

> **Cross-AI continuity with user-owned, selectively disclosed personal context.**

A compelling initial demonstration should have three acts.

### Act 1 — “It already knows me”

1. Bootstrap a Personal World Model from an existing AI history plus at least email/calendar or another personal source.
2. Connect a second AI that has never interacted with the user.
3. Ask a task that materially benefits from personal context.
4. The second AI requests an open context briefing and produces a surprisingly personalized result without interviewing the user again.

### Act 2 — “The context is independent of the assistant”

1. During the second AI interaction, the user reveals or corrects something meaningful.
2. The Personal Context Engine updates or reassesses the Personal World Model.
3. The first AI is used again later.
4. It now benefits from the updated understanding.

This demonstrates an independent evolving personal state rather than memory export/import between providers.

### Act 3 — “It knows more than it reveals”

1. A consumer asks a task for which sensitive or hypothetical personal context may matter.
2. The Personal Context Engine uses that knowledge internally.
3. It returns useful guidance or asks the consumer to verify something without leaking the sensitive underlying knowledge.

This demonstrates purpose limitation and selective computation as product behavior rather than merely an ACL system.

---

## 19. MVP requirements

The initial MVP should prove the product thesis without attempting to integrate every personal data source or solve every privacy technology problem.

It should provide:

1. **Progressive bootstrap** from at least one AI history plus one or more complementary personal sources.
2. **At least two AI consumers** able to use the same independent Personal World Model.
3. **Continuous or periodic enrichment** after bootstrap rather than one-time import only.
4. **Personal Context Engine ownership of semantic updates**; third-party consumer LLMs cannot directly write authoritative knowledge.
5. **Broad personal knowledge retention** without a closed profile schema that discards unexpected knowledge solely for lack of predicted usefulness.
6. **Knowledge evolution** including reinforcement, contextual refinement, contradiction, correction, and supersession.
7. **High-confidence hypothesis handling** distinct from factual knowledge.
8. **Open-query context serving** capable of returning a rich briefing with useful adjacent context.
9. **Selective disclosure and selective computation** based on purpose and sensitivity.
10. **Conversational correction/reassessment** without requiring direct memory editing.
11. **Consumer authorization and revocation** with per-request policy enforcement.
12. **Managed deployment path** and an architecture that preserves a credible route to first-class self-hosting.
13. **Portable/exportable personal state.**

---

## 20. Non-goals for the MVP

The MVP is not intended to be:

- a standalone general-purpose personal assistant;
- a visual personal knowledge graph;
- a CRM for the user's life;
- a replacement for Gmail, Calendar, Drive, Photos, or other source systems;
- an archival copy of all raw personal data;
- a simple cross-assistant text-memory synchronizer;
- a travel, shopping, financial, or household application;
- a fixed profile schema with predefined fields for every possible personal fact;
- a system in which consumer LLMs directly update trusted personal knowledge;
- a system that requires explicit confirmation for every learned detail;
- a system that reveals all relevant internal evidence to the user or consumer;
- a system that promises perfect zero-knowledge server-side reasoning before the compute trust problem has been solved;
- a complete ecosystem or marketplace of integrations.

---

## 21. Market context from discovery

The discovery found an active and rapidly forming category rather than an empty market.

Relevant adjacent categories include:

- built-in memories from major AI providers;
- developer memory layers such as Mem0/OpenMemory and related MCP memory projects;
- portable/cross-assistant context products;
- user-owned context backends and AI-passport-style products;
- personal data stores and Personal Data Pods such as Solid;
- emerging portable-memory and personal-context protocol proposals;
- local-first personal knowledge systems.

This is considered a positive timing signal rather than a reason to abandon the project.

The product is not gated on proving that nobody else is building something similar.

The relevant question is:

> Can this project become a sufficiently trustworthy, interoperable, useful, and well-executed implementation of user-owned personal context to deserve adoption?

The market should be revalidated before any commercial launch because the category is changing quickly.

---

## 22. Business model hypothesis

The current business-model direction is analogous to trusted personal infrastructure rather than a conventional data-harvesting SaaS.

Potential layers include:

- a usable free managed individual tier;
- a paid individual tier with more sources, processing freshness, capacity, and managed capabilities;
- a family tier later;
- official self-hosting;
- possibly an open-source or source-visible core;
- developer/API offerings for third-party consumers;
- paid integrations or advanced hosted capabilities where justified.

The value proposition must not depend on selling or exploiting the Personal World Model itself.

A useful commercial principle is:

> The product should make it convenient for the user to own their personal model, rather than monetizing ownership of that model by the provider.

Pricing, plan boundaries, and licensing remain open.

---

## 23. Product success criteria

The product should eventually be measurable against outcomes that correspond to the user experience rather than merely extraction accuracy.

Important dimensions include:

- correctness of current personal state;
- unsupported inference rate;
- stale-knowledge rate;
- quality of contradiction and change handling;
- success of conversational corrections;
- cross-assistant continuity;
- usefulness and completeness of the first context response;
- reduction in repeated questions the user must answer;
- unnecessary disclosure rate;
- privacy/policy violations;
- ability to use sensitive knowledge without leaking it;
- bootstrap usefulness from limited initial sources;
- improvement as additional sources are connected;
- latency and cost of maintaining the model;
- user trust and perceived “already knows me” effect.

The precise benchmark design, datasets, scoring rubrics, and regression harness are specification/evaluation work and are intentionally not defined in this PRD.

---

## 24. Product decisions consolidated by discovery

The following decisions are considered sufficiently stable to guide the next phase:

1. **The Personal World Model is independent of any individual assistant.**
2. **The primary wedge combines cross-AI continuity and controlled disclosure.**
3. **The model is primarily invisible; being known is the user experience.**
4. **The model learns broadly and serves selectively.**
5. **Unexpected or mundane valid personal knowledge is retained rather than discarded simply for low predicted usefulness.**
6. **Knowledge and strong hypotheses are distinct.**
7. **Consumer LLMs are not trusted authorities over model updates.**
8. **The Personal Context Engine is responsible for semantic learning and change.**
9. **AI sources may provide raw interactions, excerpts, or summaries depending on platform capabilities.**
10. **Email and calendar are high-value continuous early sources.**
11. **Context consumption is primarily pull-based and open-query-first.**
12. **The first context response should be rich enough to minimize unnecessary retrieval ping-pong.**
13. **Natural-language briefing is primary; structured output is supplemental.**
14. **The system can disclose knowledge, compute over private knowledge, or provide protective guidance without disclosure.**
15. **Consumer authorization is persistent but purpose/relevance/sensitivity policy is evaluated per request.**
16. **Correction is conversational semantic reassessment, not manual memory CRUD.**
17. **Disconnecting a source does not automatically erase already learned knowledge.**
18. **The product is not a complete raw-data vault.**
19. **Enough compact evidence/lineage should remain internally to support later reassessment without obsessively storing every source item.**
20. **Managed hosting is the default product path; self-hosting is a first-class alternative.**
21. **The service operator should not have standing access to the Personal World Model.**
22. **No API keys should be required from ordinary managed-service users.**
23. **Processing frequency may scale with plans; product quality should not rely on the consumer's chosen LLM.**

---

## 25. Questions explicitly deferred to specification / Wayfinder

The next phase should resolve implementation and architecture questions without reopening settled product principles unless evidence forces it.

Key deferred questions include:

- internal representation: graph, relational, document, hybrid, or other;
- source normalization contracts;
- exact Signal / Observation / Knowledge representation;
- how much raw excerpt versus compact observation to retain;
- bounded historical reprocessing and reassessment windows;
- batch, micro-batch, event-driven, and priority-triggered learning;
- delta handling and source synchronization;
- model routing and escalation strategies;
- deterministic versus LLM responsibilities inside the Context Engine;
- compute budgets for free and premium tiers;
- exact semantic-commit invariants;
- context retrieval and bounded iterative retrieval design;
- exact authorization/scoping model;
- MCP versus API versus other consumer protocols;
- source-specific constraints for ChatGPT, Claude, Gemini, and future providers;
- user-key ownership and key recovery;
- managed confidential-compute architecture;
- local versus server-side compute;
- self-host deployment architecture;
- portable export format;
- open-source/source-visible licensing decision;
- concrete evaluation harness and benchmark datasets.

---

## 26. Gate for the next phase

Product discovery is considered sufficiently complete to move forward when the next design phase can work from this PRD without needing to rediscover the fundamental value proposition.

The design should preserve this central product boundary:

> **The Personal World Model's job is to understand and maintain the person independently of any assistant, then make the right part of that understanding available to the right consumer for the right purpose.**

The next step is specification and architecture exploration, not further broad product ideation.