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

**Personal Knowledge**:
A conclusion sufficiently reliable to represent the system's current understanding, while retaining its temporal and contextual applicability.
_Avoid_: Memory, immutable fact

**High-confidence Hypothesis**:
A strongly supported but explicitly non-factual conclusion that may guide reasoning without being disclosed as Personal Knowledge.
_Avoid_: Fact, confirmed knowledge

**Personal Context Engine**:
The product-controlled system that interprets Signals and is solely responsible for authoritative semantic changes to the Personal World Model.
_Avoid_: Consumer memory, source authority

**Semantic Commit**:
The controlled application of a validated Personal Model Change Proposal to the Personal World Model.
_Avoid_: Direct write, memory sync

**Context Bundle**:
A task-specific response for a Consumer that combines a rich natural-language briefing with only the structured constraints needed for deterministic behavior.
_Avoid_: Full profile dump, memory export
