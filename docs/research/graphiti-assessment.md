# Graphiti Assessment for the Personal World Model

**Scope.** This note assesses [getzep/graphiti](https://github.com/getzep/graphiti) for concepts worth adopting by the Personal World Model (PWM). It is not an implementation plan or a recommendation to introduce Graphiti, Neo4j, or another graph database. Sources were checked on 2026-09-11 and are Graphiti's official repository and documentation, plus the PWM's established contracts in [CONTEXT.md](../../CONTEXT.md) and [MVP specification issue #16](https://github.com/DanieleSuppo/personal-world-model/issues/16).

## Conclusion

Graphiti is useful **inspiration for a derived retrieval projection**, not a PWM authority or dependency. Its temporal relationship representation, explicit source episode links, and hybrid/focal-entity retrieval offer design ideas for a future, rebuildable graph-shaped projection. They do not change the MVP decision that the **PostgreSQL Model Assertion ledger remains the sole authoritative store**.[^1]

## Useful Inspiration

| Graphiti concept | Evidence | PWM-compatible interpretation |
| --- | --- | --- |
| Temporal relationships | Graphiti represents facts as entity-to-entity edges with `valid_at`, `invalid_at`, `expired_at`, and the source's `reference_time`.[^2] Its overview describes point-in-time queries and temporal edge lifecycles.[^3] | Preserve the distinction between when an assertion applies and when the system learned/retired it. PWM already names the former **Validity**; the ledger must additionally retain commit and lineage semantics. A projection may materialize temporal graph edges from assertion revisions without becoming their authority. |
| Episode-to-fact provenance | Graphiti ingests discrete episodes and records links from an episode to extracted entities; derived relationship edges carry a list of episode identifiers.[^4][^2] | Retain the structural pattern, but map it to PWM's compact `Model Assertion -> Observation -> Signal/source locator` lineage. This is aligned with Evidence Independence, rather than treating repeated derived edges as independent support. |
| Hybrid retrieval plus a focal entity | Graphiti combines semantic and BM25 retrieval with reciprocal-rank fusion, and can rerank results by distance from a focal node.[^5] | This is a useful retrieval pattern after policy, purpose, time, and applicability filters select authorized assertion revisions. A focal **Semantic Anchor** can improve a bounded Context Bundle without requiring a closed ontology. |
| Prescribed or learned types | Graphiti supports developer-defined entity and edge types while also allowing extracted structure to emerge.[^3] | PWM's optional Semantic Anchors intentionally avoid a fixed ontology. Use explicit types only where a Consumer needs deterministic constraints; preserve open-world fields and do not turn graph labels into a required profile schema. |

## Conflicts and Non-Adoptable Aspects

| Graphiti behavior or assumption | Conflict with PWM contract | Assessment |
| --- | --- | --- |
| Graphiti stores raw episode `content` on its episodic nodes.[^6] | The MVP discards full Signal content after first processing unless a selected excerpt is needed; durable material is compact Observation, provenance, and Semantic Commit lineage.[^1] | Do not adopt Graphiti's episode store as PWM storage. A derived projection may retain only policy-safe excerpts or identifiers needed to resolve compact lineage. |
| Adding an episode extracts and incrementally integrates entities and relationships; Graphiti describes autonomous graph construction and temporal invalidation.[^3][^4] | PWM requires Signal normalization, Observation extraction, Candidate Interpretation, validation of a versioned Personal Model Change Proposal, then an atomic idempotent Semantic Commit against a Relevant State Version.[^1] | Graphiti cannot be allowed to make authoritative semantic changes. Its extraction could at most inform non-authoritative Candidate Interpretations, subject to PWM validation and evidence rules. |
| Graphiti's relationship records are mutable graph objects, including deletion methods and temporal invalidation fields.[^2] | PWM requires durable, interpretable assertion history, direct lineage, supersession semantics, and idempotent commits in the authoritative PostgreSQL ledger.[^1] | Do not use Graphiti edge lifecycle as the history model. Emit or rebuild projection rows from immutable/assertion-revision lineage instead. |
| Graphiti requires a third-party graph backend (Neo4j, FalkorDB, or Amazon Neptune) and uses LLM/embedding providers for normal operation.[^7] | The MVP calls for one PostgreSQL authority and makes graph representation a future rebuildable serving projection.[^1] It also requires named, purpose-bound model processing with minimum necessary content.[^1] | Do not add Graphiti or its graph backends to the MVP. Any future model-assisted projection work must meet the existing minimum-necessary, no-training, no-retention provider contract. |
| Graphiti partitions a graph with `group_id`, but its documented search examples are retrieval/ranking APIs rather than PWM's per-task purpose mediation and five serving outcomes.[^2][^5] | PWM must evaluate Consumer authorization, declared purpose, sensitivity, and task before serving a Context Bundle, including `disclose`, `compute`, `guide`, `ask`, or `deny` outcomes.[^1] | A graph projection cannot be the policy decision point. It must receive only authorized candidate IDs or be queried through mandatory ledger/policy filters, and its results must resolve to assertion revisions before bundle assembly. |

## Narrow Recommendation

Do not adopt Graphiti, replace the authoritative PostgreSQL Model Assertion ledger, or add a graph database. If a later Context Bundle evaluation demonstrates a specific multi-hop query that lexical/vector retrieval cannot serve well, run one bounded projection experiment:

1. Materialize a rebuildable adjacency projection from already-authorized Model Assertion revisions and Semantic Anchors in PostgreSQL.
2. Give every projected edge the assertion revision ID, compact supporting Observation IDs, Validity, Applicability/policy reference, and projection version.
3. Apply authorization, purpose, sensitivity, Validity, and Applicability filters before hybrid ranking or focal-anchor distance reranking; resolve selected results back to the ledger for final Context Bundle assembly.
4. Evaluate only that demonstrated query class against the existing non-graph retrieval baseline. Keep the projection disposable and outside Semantic Commit transactions.

This adopts Graphiti's retrieval and temporal-provenance lessons while preserving the PWM's authoritative-write, evidence, selective-disclosure, portability, and raw-content-retention contracts.

## Sources

[^1]: [PWM MVP specification issue #16](https://github.com/DanieleSuppo/personal-world-model/issues/16), especially Implementation Decisions; see also [CONTEXT.md](../../CONTEXT.md) for the defined contracts and vocabulary.
[^2]: [Graphiti `EntityEdge` source](https://github.com/getzep/graphiti/blob/main/graphiti_core/edges.py), fields and persistence behavior for facts, episodes, embeddings, and temporal timestamps.
[^3]: [Graphiti Overview](https://help.getzep.com/graphiti/getting-started/overview), temporal context graphs, episodic processing, custom types, hybrid retrieval, and supported backends.
[^4]: [Graphiti: Adding Episodes](https://help.getzep.com/graphiti/core-concepts/adding-episodes), episode types, point-in-time provenance, and incremental/bulk ingestion behavior.
[^5]: [Graphiti: Searching the Graph](https://help.getzep.com/graphiti/working-with-data/searching), semantic plus BM25 hybrid retrieval, reciprocal-rank fusion, and node-distance reranking.
[^6]: [Graphiti `EpisodicNode` source](https://github.com/getzep/graphiti/blob/main/graphiti_core/nodes.py), durable `content`, source description, source type, validity time, and episode metadata fields.
[^7]: [Graphiti README](https://github.com/getzep/graphiti#installation), runtime database and LLM-provider requirements.
