-- Expand only: existing acquired content, tombstones and alias keys remain intact.
ALTER TABLE signals ADD CONSTRAINT signals_tenant_receipt UNIQUE (tenant_id, receipt_id);
CREATE TABLE model_state_versions (
    tenant_id text PRIMARY KEY,
    revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
CREATE TABLE semantic_commits (
    id uuid PRIMARY KEY,
    tenant_id text NOT NULL,
    receipt_id uuid NOT NULL,
    input_identity text NOT NULL,
    policy_identity text NOT NULL,
    proposal_digest text NOT NULL CHECK (length(proposal_digest) = 64),
    evaluated_version bigint NOT NULL CHECK (evaluated_version >= 0),
    committed_version bigint NOT NULL,
    operation text NOT NULL CHECK (operation IN ('add', 'no_meaningful_change')),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id), UNIQUE (tenant_id, receipt_id, id), UNIQUE (tenant_id, receipt_id), UNIQUE (tenant_id, input_identity),
    FOREIGN KEY (tenant_id, receipt_id) REFERENCES signals (tenant_id, receipt_id),
    CHECK (committed_version = evaluated_version + CASE WHEN operation = 'add' THEN 1 ELSE 0 END)
);
CREATE TABLE observations (
    id uuid PRIMARY KEY,
    tenant_id text NOT NULL,
    receipt_id uuid NOT NULL,
    description text NOT NULL CHECK (length(description) BETWEEN 1 AND 1024),
    excerpt text NOT NULL CHECK (length(excerpt) BETWEEN 1 AND 512),
    UNIQUE (tenant_id, id), UNIQUE (tenant_id, receipt_id, id),
    FOREIGN KEY (tenant_id, receipt_id) REFERENCES signals (tenant_id, receipt_id)
);
CREATE TABLE model_assertions (
    id uuid PRIMARY KEY,
    tenant_id text NOT NULL,
    receipt_id uuid NOT NULL,
    semantic_commit_id uuid NOT NULL,
    revision integer NOT NULL DEFAULT 1 CHECK (revision = 1),
    classification text NOT NULL CHECK (classification IN ('personal_knowledge', 'high_confidence_hypothesis')),
    claim text NOT NULL CHECK (length(claim) BETWEEN 1 AND 2048),
    metadata jsonb NOT NULL CHECK (COALESCE(jsonb_typeof(metadata) = 'object'
      AND metadata->>'originBasis' IN ('user_stated','imported','observed','inferred')
      AND metadata->>'sensitivity' IN ('ordinary','sensitive','highly_sensitive')
      AND jsonb_typeof(metadata->'validity') = 'object'
      AND jsonb_typeof(metadata->'applicability') = 'string'
      AND jsonb_typeof(metadata->'support') = 'string', false)),
    current boolean NOT NULL DEFAULT true CHECK (current),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id), UNIQUE (tenant_id, receipt_id, id),
    FOREIGN KEY (tenant_id, receipt_id, semantic_commit_id) REFERENCES semantic_commits (tenant_id, receipt_id, id),
    FOREIGN KEY (tenant_id, receipt_id) REFERENCES signals (tenant_id, receipt_id)
);
CREATE TABLE assertion_observations (
    tenant_id text NOT NULL,
    receipt_id uuid NOT NULL,
    assertion_id uuid NOT NULL,
    observation_id uuid NOT NULL,
    PRIMARY KEY (tenant_id, assertion_id, observation_id),
    FOREIGN KEY (tenant_id, receipt_id, assertion_id) REFERENCES model_assertions (tenant_id, receipt_id, id),
    FOREIGN KEY (tenant_id, receipt_id, observation_id) REFERENCES observations (tenant_id, receipt_id, id)
);
CREATE TABLE signal_learning_attempts (
    tenant_id text NOT NULL,
    receipt_id uuid NOT NULL,
    state text NOT NULL CHECK (state IN ('deferred', 'completed', 'pending')),
    reason text CHECK (reason IN ('processor_not_configured','processor_failed','invalid_proposal','stale_contention','content_deleted','storage_failed')),
    policy_identity text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, receipt_id),
    FOREIGN KEY (tenant_id, receipt_id) REFERENCES signals (tenant_id, receipt_id),
    CHECK ((state = 'deferred' AND reason IS NOT NULL) OR (state <> 'deferred' AND reason IS NULL))
);
CREATE INDEX signals_learning_scan ON signals (received_at, receipt_id) WHERE state IN ('accepted','deferred');
CREATE INDEX assertions_owner_read ON model_assertions (tenant_id, created_at, id) WHERE current;
