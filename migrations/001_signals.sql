CREATE TABLE signals (
    receipt_id uuid PRIMARY KEY,
    tenant_id text NOT NULL,
    origin_type text NOT NULL CHECK (origin_type IN ('source', 'consumer', 'user')),
    origin_id text NOT NULL,
    fidelity text NOT NULL CHECK (fidelity IN ('raw', 'excerpt', 'summary')),
    content text NOT NULL,
    source_item_id text,
    source_revision text,
    source_cursor text,
    state text NOT NULL DEFAULT 'accepted' CHECK (
        state IN ('accepted', 'deferred', 'reassessing', 'committed', 'no meaningful change', 'rejected')
    ),
    received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (origin_type <> 'source' OR source_item_id IS NOT NULL),
    CHECK (source_item_id IS NOT NULL OR (source_revision IS NULL AND source_cursor IS NULL))
);
