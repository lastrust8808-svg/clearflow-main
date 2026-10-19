-- Clear.Flow additive storage foundation migration (PostgreSQL).
-- Apply only to an isolated staging clone after verified backup.
-- Production execution requires separate explicit approval.
BEGIN;
CREATE TABLE IF NOT EXISTS public.clearflow_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.clearflow_account_snapshots (
  account_id TEXT PRIMARY KEY,
  app_data JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.clearflow_account_records (
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  record_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, kind, record_key)
);
CREATE TABLE IF NOT EXISTS public.clearflow_entity_memberships (
  account_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('invoice_create', 'payment_approve')),
  granted_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, entity_id, permission)
);
CREATE TABLE IF NOT EXISTS public.clearflow_b2b_deliveries (
  delivery_id TEXT PRIMARY KEY,
  issuer_account_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  payer_entity_id TEXT NOT NULL,
  payee_entity_id TEXT NOT NULL,
  invoice_payload JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issuer_account_id, invoice_id)
);
INSERT INTO public.clearflow_schema_migrations (version)
VALUES ('001_storage_foundation')
ON CONFLICT (version) DO NOTHING;
COMMIT;
