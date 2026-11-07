-- PROPOSED, NOT APPLIED: banking feed storage migration.
-- Requires the reviewed 001 foundation migration and staging-only migration runner.
-- Never auto-create a cursor for an unauthenticated or unapproved connection.
BEGIN;
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.clearflow_schema_migrations
    WHERE version = '003_banking_feed_checkpoints'
  ) THEN
    RETURN;
  END IF;

  CREATE TABLE public.clearflow_bank_feed_checkpoints (
    tenant_id TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('plaid', 'mercury')),
    connection_id TEXT NOT NULL,
    cursor TEXT,
    revision BIGINT NOT NULL DEFAULT 0
      CHECK (revision >= 0 AND revision <= 9007199254740991),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, provider, connection_id),
    CHECK (length(tenant_id) BETWEEN 1 AND 256),
    CHECK (length(connection_id) BETWEEN 1 AND 256),
    CHECK (cursor IS NULL OR length(cursor) BETWEEN 1 AND 4096)
  );

  CREATE TABLE public.clearflow_bank_feed_entries (
    tenant_id TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('plaid', 'mercury')),
    connection_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, provider, connection_id, account_id, transaction_id),
    FOREIGN KEY (tenant_id, provider, connection_id)
      REFERENCES public.clearflow_bank_feed_checkpoints
      (tenant_id, provider, connection_id) ON DELETE RESTRICT,
    CHECK (length(account_id) BETWEEN 1 AND 256),
    CHECK (length(transaction_id) BETWEEN 1 AND 256)
  );

  CREATE INDEX clearflow_bank_feed_entries_scope_idx
    ON public.clearflow_bank_feed_entries
    (tenant_id, provider, connection_id, account_id);

  INSERT INTO public.clearflow_schema_migrations(version)
  VALUES ('003_banking_feed_checkpoints');
END $migration$;
COMMIT;
