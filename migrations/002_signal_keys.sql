CREATE TABLE signal_keys (
    tenant_id text NOT NULL,
    origin_type text NOT NULL,
    origin_id text NOT NULL,
    idempotency_key text NOT NULL,
    receipt_id uuid NOT NULL REFERENCES signals (receipt_id),
    PRIMARY KEY (tenant_id, origin_type, origin_id, idempotency_key)
);
