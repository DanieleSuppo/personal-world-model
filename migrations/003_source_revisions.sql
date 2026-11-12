CREATE UNIQUE INDEX signals_source_revision
    ON signals (tenant_id, origin_type, origin_id, source_item_id, source_revision)
    WHERE source_revision IS NOT NULL;
