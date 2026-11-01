-- Disposable PostgreSQL 16 acceptance fixture for proposed banking migration 003.
-- This is not a production migration, tenant-auth test, or provider integration.
\set ON_ERROR_STOP on

DO $test$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM public.clearflow_schema_migrations
    WHERE version = '003_banking_feed_checkpoints';
  IF n <> 1 THEN RAISE EXCEPTION '003 migration must be registered once'; END IF;
  IF to_regclass('public.clearflow_bank_feed_checkpoints') IS NULL OR
     to_regclass('public.clearflow_bank_feed_entries') IS NULL THEN
    RAISE EXCEPTION '003 banking tables are missing';
  END IF;
END $test$;

INSERT INTO public.clearflow_bank_feed_checkpoints
  (tenant_id, provider, connection_id, cursor, revision)
VALUES
  ('tenant-a', 'plaid', 'shared-item', NULL, 0),
  ('tenant-b', 'plaid', 'shared-item', NULL, 0);

-- A failed page must not persist either the entry or its cursor.
BEGIN;
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES
  ('tenant-a', 'plaid', 'shared-item', 'acct-a', 'tx-rollback',
   '{"amountCents":1200}'::jsonb);
UPDATE public.clearflow_bank_feed_checkpoints
  SET cursor = 'abandoned-page', revision = 1
  WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
    AND connection_id = 'shared-item';
ROLLBACK;

DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.clearflow_bank_feed_entries
             WHERE transaction_id = 'tx-rollback') THEN
    RAISE EXCEPTION 'Rolled-back entry survived';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clearflow_bank_feed_checkpoints
             WHERE tenant_id = 'tenant-a'
               AND (cursor IS NOT NULL OR revision <> 0)) THEN
    RAISE EXCEPTION 'Rolled-back cursor survived';
  END IF;
END $test$;

-- An accepted page persists its entry and cursor in one transaction.
BEGIN;
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES
  ('tenant-a', 'plaid', 'shared-item', 'acct-a', 'tx-1',
   '{"amountCents":1200}'::jsonb);
UPDATE public.clearflow_bank_feed_checkpoints
  SET cursor = 'cursor-1', revision = 1
  WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
    AND connection_id = 'shared-item'
    AND cursor IS NOT DISTINCT FROM NULL AND revision = 0;
COMMIT;

-- A replay of the same provider identity must update, not duplicate.
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES
  ('tenant-a', 'plaid', 'shared-item', 'acct-a', 'tx-1',
   '{"amountCents":1200,"replayed":true}'::jsonb)
ON CONFLICT (tenant_id, provider, connection_id, account_id, transaction_id)
DO UPDATE SET payload = EXCLUDED.payload;

-- Identical provider IDs in a different tenant remain independent.
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES
  ('tenant-b', 'plaid', 'shared-item', 'acct-b', 'tx-1',
   '{"amountCents":3500}'::jsonb);

DO $test$
DECLARE n INTEGER; affected INTEGER;
BEGIN
  SELECT count(*) INTO n FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1';
  IF n <> 1 THEN RAISE EXCEPTION 'Replay produced duplicate entries'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND transaction_id = 'tx-1'
      AND payload->>'replayed' = 'true'
  ) THEN RAISE EXCEPTION 'Replay upsert did not persist'; END IF;
  IF (SELECT count(*) FROM public.clearflow_bank_feed_entries
      WHERE transaction_id = 'tx-1') <> 2 THEN
    RAISE EXCEPTION 'Tenant composite identity was not preserved';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Accepted page cursor was not committed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-b' AND cursor IS NULL AND revision = 0
  ) THEN RAISE EXCEPTION 'Foreign tenant checkpoint changed'; END IF;

  -- Stale compare-and-swap cannot advance an already committed cursor.
  UPDATE public.clearflow_bank_feed_checkpoints
    SET cursor = 'stale-cursor', revision = 1
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item'
      AND cursor IS NOT DISTINCT FROM NULL AND revision = 0;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Stale cursor CAS succeeded'; END IF;
END $test$;

-- The composite FK blocks orphaned or forged connection identities.
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.clearflow_bank_feed_entries
      (tenant_id, provider, connection_id, account_id, transaction_id, payload)
    VALUES
      ('tenant-a', 'plaid', 'unapproved-item', 'acct-a', 'tx-forged', '{}'::jsonb);
    RAISE EXCEPTION 'Orphan banking entry was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.clearflow_bank_feed_checkpoints
      (tenant_id, provider, connection_id, revision)
    VALUES ('tenant-c', 'plaid', 'item-c', -1);
    RAISE EXCEPTION 'Negative cursor revision was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $test$;

SELECT 'PASS: migration idempotence, rollback, replay identity, tenant key isolation, cursor CAS and constraints' AS result;
