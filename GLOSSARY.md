# Personal World Model

Personal World Model is a user-owned, evolving representation of a person and their world that remains independent from the AI consumers that use it.

## Language

**Personal World Model**:
The authoritative, evolving representation of what the system currently understands about a person and their world.
_Avoid_: Profile, memory store, user graph

**Consumer**:
An AI or application authorized to request task-specific context from a Personal World Model without becoming its authoritative copy.
_Avoid_: Owner, source, model authority

**Source**:
A connected system that supplies signals for learning but does not authoritatively modify the Personal World Model.
_Avoid_: Consumer, knowledge authority

**Signal**:
Raw or partially interpreted material received from a Source.
_Avoid_: Knowledge, fact

**Observation**:
A potentially meaningful recognition derived from one or more Signals, retaining compact support when needed for reassessment.
_Avoid_: Fact, final conclusion

**Candidate Interpretation**:
Temporary reasoning over Observations that may support a Personal Model Change Proposal but is not authoritative model state.
_Avoid_: Model Assertion, fact

**Personal Knowledge**:
A conclusion sufficiently reliable to represent the system's current understanding, while retaining its temporal and contextual applicability.
_Avoid_: Memory, immutable fact

**High-confidence Hypothesis**:
A strongly supported but explicitly non-factual conclusion that may guide reasoning without being disclosed as Personal Knowledge.
_Avoid_: Fact, confirmed knowledge

**Model Assertion**:
The general authoritative unit representing a conclusion about the person or their world, classified as Personal Knowledge or a High-confidence Hypothesis.
_Avoid_: Memory entry, profile field, fact record

**Semantic Anchor**:
An optional structured reference within a Model Assertion that identifies a subject, relation, theme, person, place, time, or condition without imposing a closed ontology.
_Avoid_: Required profile field, fixed category

**Personal Context Engine**:
The product-controlled system that interprets Signals and is solely responsible for authoritative semantic changes to the Personal World Model.
_Avoid_: Consumer memory, source authority

**Personal Model Change Proposal**:
A versioned, idempotent set of proposed semantic changes evaluated against identified inputs, state, and policy before it can alter the Personal World Model.
_Avoid_: Direct write, source update

**Semantic Commit**:
The controlled application of a validated Personal Model Change Proposal to the Personal World Model.
_Avoid_: Direct write, memory sync

**Relevant State Version**:
The version of the model state against which a Personal Model Change Proposal was evaluated and which must still hold before its Semantic Commit.
_Avoid_: Automatic merge, stale write

**Evidence Independence**:
The requirement that support for a Model Assertion traces to distinct underlying Observations and Signals rather than to the assertion or derived inference itself.
_Avoid_: Repetition, circular reinforcement

**User-stated Origin**:
The origin classification for a Model Assertion supported by an explicit user statement, which is privileged without making the assertion perpetually current.
_Avoid_: Permanent fact, unqualified truth

**Privileged Corrective Signal**:
A user-originated Signal that directs correction of the model and takes precedence over conflicting derived signals without bypassing semantic validation.
_Avoid_: Direct CRUD edit, ordinary source signal

**Validity**:
The time interval during which a Model Assertion is understood to hold.
_Avoid_: Current status, freshness

**Applicability**:
The conditions under which a Model Assertion is understood to hold.
_Avoid_: Validity, current status

**Context Bundle**:
A task-specific response for a Consumer that combines a rich natural-language briefing with only the structured constraints needed for deterministic behavior.
_Avoid_: Full profile dump, memory export

**Managed Runtime Processing**:
Authorized processing of decrypted Personal World Model data within the managed service's controlled runtime, without granting the service operator standing human access to that data.
_Avoid_: Zero knowledge, operator access

**Managed Key Custody**:
Service-controlled, tenant-separated key material that protects managed authoritative state and compact lineage while permitting only authorized Managed Runtime Processing.
_Avoid_: User-managed runtime key, operator content access

**User-Controlled Export Encryption**:
Encryption of a Portable Personal World Model Package with a user-chosen key or passphrase that is not held by the managed service and is required to import the package elsewhere.
_Avoid_: Managed export key, recoverable export

**Content-Blind Support**:
Support that diagnoses a Personal World Model through operational metadata, user-provided material, and user-visible diagnostics without staff inspection of decrypted personal content.
_Avoid_: Break-glass access, content support

**Portable Personal World Model Package**:
The exportable representation of authoritative Model Assertions, their semantic metadata, compact reassessment lineage, and source, consumer, and policy configuration needed to continue using a Personal World Model elsewhere.
_Avoid_: Raw-data archive, provider backup

**Self-Hosted Compatibility**:
The ability for an independently operated deployment to import and export the Portable Personal World Model Package while preserving the same semantic and selective-disclosure contracts as managed deployment.
_Avoid_: Managed feature parity, a specific installer

**Self-Hosted Operator**:
The user or chosen operator responsible for the identity, keys, infrastructure, retention, availability, and trust boundary of a self-hosted deployment.
_Avoid_: Managed service operator, automatic content-blind support

**Confidential-Compute Compatibility**:
The ability of a future confidential-compute deployment to preserve the observable Personal World Model contracts without making the managed product a confidential-compute promise.
_Avoid_: Managed confidential compute, specified TEE

**Purpose-Bound Model Processor**:
An explicitly named external model provider that may process only the minimum Personal World Model content needed for an authorized managed operation, without training rights or retention beyond that operation.
_Avoid_: Unnamed AI vendor, general data recipient

**Managed Account Exit**:
The managed account-closure process: immediate Consumer and Source revocation, user export, and deletion of managed authoritative state, compact lineage, and their protecting key material within a disclosed retention window, separately from backup expiry.
_Avoid_: Source-system deletion, instant backup deletion
