-- Expand the existing ledger without rewriting acquired content or receipts.
ALTER TABLE signals
    ALTER COLUMN content DROP NOT NULL,
    ADD COLUMN content_sha256 bytea,
    ADD COLUMN content_deleted_at timestamptz,
    ADD COLUMN content_deletion_reason text;

UPDATE signals SET content_sha256 = sha256(convert_to(content, 'UTF8'));

ALTER TABLE signals
    ALTER COLUMN content_sha256 SET NOT NULL,
    ADD CONSTRAINT signal_content_digest CHECK (octet_length(content_sha256) = 32),
    ADD CONSTRAINT signal_content_retention CHECK (
        (content IS NOT NULL AND content_deleted_at IS NULL AND content_deletion_reason IS NULL)
        OR
        (content IS NULL AND content_deleted_at IS NOT NULL
         AND content_deletion_reason IS NOT NULL
         AND content_deletion_reason IN ('user_request', 'privacy_policy'))
    );

CREATE FUNCTION guard_signal_retention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'Signal retention forbids ordinary deletion' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.content IS NULL OR NEW.content_deleted_at IS NOT NULL OR NEW.content_deletion_reason IS NOT NULL THEN
            RAISE EXCEPTION 'New Signals must retain acquired content' USING ERRCODE = '23514';
        END IF;
        NEW.content_sha256 := sha256(convert_to(NEW.content, 'UTF8'));
        RETURN NEW;
    END IF;
    IF ROW(NEW.receipt_id, NEW.tenant_id, NEW.origin_type, NEW.origin_id, NEW.fidelity,
           NEW.source_item_id, NEW.source_revision, NEW.source_cursor, NEW.received_at, NEW.content_sha256)
       IS DISTINCT FROM
       ROW(OLD.receipt_id, OLD.tenant_id, OLD.origin_type, OLD.origin_id, OLD.fidelity,
           OLD.source_item_id, OLD.source_revision, OLD.source_cursor, OLD.received_at, OLD.content_sha256) THEN
        RAISE EXCEPTION 'Acquired Signal identity and fidelity are immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.content IS DISTINCT FROM OLD.content THEN
        IF NEW.content IS NOT NULL OR NEW.content_deleted_at IS NULL
           OR NEW.content_deletion_reason IS NULL
           OR NEW.content_deletion_reason NOT IN ('user_request', 'privacy_policy') THEN
            RAISE EXCEPTION 'Only explicit privacy deletion may clear pending content' USING ERRCODE = '23514';
        END IF;
    ELSIF ROW(NEW.content_deleted_at, NEW.content_deletion_reason)
          IS DISTINCT FROM ROW(OLD.content_deleted_at, OLD.content_deletion_reason) THEN
        RAISE EXCEPTION 'Content deletion metadata is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER signal_retention_guard
    BEFORE INSERT OR UPDATE OR DELETE ON signals
    FOR EACH ROW EXECUTE FUNCTION guard_signal_retention();
CREATE TRIGGER signal_retention_truncate_guard
    BEFORE TRUNCATE ON signals
    FOR EACH STATEMENT EXECUTE FUNCTION guard_signal_retention();

-- #35 must add atomic durable consolidation coverage before enabling ordinary cleanup.
-- Receipt state (including 'committed') deliberately does not authorize content deletion.
