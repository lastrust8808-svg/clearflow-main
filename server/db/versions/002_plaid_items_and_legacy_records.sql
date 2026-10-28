BEGIN;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM public.clearflow_schema_migrations WHERE version='002_plaid_items_and_legacy_records') THEN
    RETURN;
  END IF;
-- Preserve prior Plaid draft records without replacing or discarding payloads.
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='clearflow_account_records' AND column_name='record_type') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
        AND table_name='clearflow_account_records' AND column_name='kind') THEN
      RAISE EXCEPTION 'Ambiguous legacy records schema: both kind and record_type exist';
    END IF;
    ALTER TABLE public.clearflow_account_records RENAME COLUMN record_type TO kind;
  END IF;
END;
-- The older compatibility branch stored app snapshots in the generic records table.
BEGIN
  IF EXISTS (SELECT 1 FROM public.clearflow_account_records r
    JOIN public.clearflow_account_snapshots s ON s.account_id=r.account_id
    WHERE r.kind='app-data' AND r.record_key='default' AND r.payload<>s.app_data) THEN
    RAISE EXCEPTION 'Conflicting legacy snapshots require explicit reconciliation';
  END IF;
END;
INSERT INTO public.clearflow_account_snapshots(account_id,app_data)
SELECT account_id,payload FROM public.clearflow_account_records
WHERE kind='app-data' AND record_key='default'
ON CONFLICT(account_id) DO NOTHING;
-- Preserve old keys as historical source; copy to the current canonical keys.
BEGIN
  IF EXISTS (SELECT 1 FROM public.clearflow_account_records old
    JOIN public.clearflow_account_records current ON current.account_id=old.account_id
      AND current.kind=old.kind AND current.record_key=CASE old.kind WHEN 'proof' THEN 'chains' ELSE 'connections' END
    WHERE old.kind IN ('proof','plaid') AND old.record_key='default' AND old.payload<>current.payload) THEN
    RAISE EXCEPTION 'Conflicting legacy vaults require explicit reconciliation';
  END IF;
END;
INSERT INTO public.clearflow_account_records(account_id,kind,record_key,payload)
SELECT account_id,kind,CASE kind WHEN 'proof' THEN 'chains' ELSE 'connections' END,payload
FROM public.clearflow_account_records WHERE kind IN ('proof','plaid') AND record_key='default'
ON CONFLICT(account_id,kind,record_key) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.clearflow_plaid_items (
  item_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  encrypted_payload JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS clearflow_plaid_items_account ON public.clearflow_plaid_items(account_id);
INSERT INTO public.clearflow_schema_migrations(version)
VALUES ('002_plaid_items_and_legacy_records') ON CONFLICT DO NOTHING;
END $migration$;
COMMIT;
