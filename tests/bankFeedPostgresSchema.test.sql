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

-- Provider namespace is part of the composite key: identical connection/account/
-- transaction identifiers from Plaid and Mercury must never overwrite each other.
INSERT INTO public.clearflow_bank_feed_checkpoints
  (tenant_id, provider, connection_id, cursor, revision)
VALUES ('tenant-a', 'mercury', 'shared-item', NULL, 0);
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'mercury', 'shared-item', 'acct-a', 'tx-1',
        '{"amountCents":9900,"source":"mercury"}'::jsonb);
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.clearflow_bank_feed_entries
      WHERE tenant_id = 'tenant-a' AND connection_id = 'shared-item'
        AND account_id = 'acct-a' AND transaction_id = 'tx-1') <> 2 THEN
    RAISE EXCEPTION 'Provider identities collided';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1' AND payload->>'replayed' = 'true'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1' AND payload->>'source' = 'mercury'
  ) THEN
    RAISE EXCEPTION 'Provider-scoped evidence was overwritten';
  END IF;
END $test$;

-- Provider-scoped cursor advancement must not mutate the other provider's cursor.
DO $test$
DECLARE affected INTEGER;
BEGIN
  UPDATE public.clearflow_bank_feed_checkpoints
    SET cursor = 'mercury-cursor-1', revision = 1
    WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
      AND connection_id = 'shared-item'
      AND cursor IS NOT DISTINCT FROM NULL AND revision = 0;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Mercury cursor CAS failed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Mercury cursor update modified Plaid checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor IS NULL AND revision = 0
  ) THEN RAISE EXCEPTION 'Mercury cursor update modified another tenant'; END IF;
  UPDATE public.clearflow_bank_feed_checkpoints
    SET cursor = 'mercury-stale', revision = 1
    WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
      AND connection_id = 'shared-item'
      AND cursor IS NOT DISTINCT FROM NULL AND revision = 0;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Stale Mercury cursor CAS succeeded'; END IF;
END $test$;

-- Account ID is also part of the entry identity: two accounts with the same
-- provider transaction ID must persist independently, including after replay.
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'plaid', 'shared-item', 'acct-other', 'tx-1',
        '{"amountCents":4700,"account":"other"}'::jsonb);
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'plaid', 'shared-item', 'acct-other', 'tx-1',
        '{"amountCents":4700,"replayed":true}'::jsonb)
ON CONFLICT (tenant_id, provider, connection_id, account_id, transaction_id)
DO UPDATE SET payload = EXCLUDED.payload;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.clearflow_bank_feed_entries
      WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
        AND connection_id = 'shared-item' AND transaction_id = 'tx-1') <> 2 THEN
    RAISE EXCEPTION 'Account-scoped transaction identities collided or duplicated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1' AND payload->>'replayed' = 'true'
      AND payload->>'amountCents' = '1200'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-other'
      AND transaction_id = 'tx-1' AND payload->>'replayed' = 'true'
      AND payload->>'amountCents' = '4700'
  ) THEN RAISE EXCEPTION 'Account-scoped replay overwrote other account evidence'; END IF;
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
  -- A known connection in another tenant or provider is not authorization.
  BEGIN
    INSERT INTO public.clearflow_bank_feed_entries
      (tenant_id, provider, connection_id, account_id, transaction_id, payload)
    VALUES ('tenant-b', 'mercury', 'shared-item', 'acct-b', 'tx-cross-provider', '{}'::jsonb);
    RAISE EXCEPTION 'Cross-provider connection impersonation was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.clearflow_bank_feed_entries
      (tenant_id, provider, connection_id, account_id, transaction_id, payload)
    VALUES ('tenant-c', 'plaid', 'shared-item', 'acct-a', 'tx-cross-tenant', '{}'::jsonb);
    RAISE EXCEPTION 'Cross-tenant connection impersonation was accepted';
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

-- Connection removal must fail closed while committed financial evidence exists.
-- ON DELETE RESTRICT prevents an accidental cascade that erases transactions.
DO $test$
BEGIN
  BEGIN
    DELETE FROM public.clearflow_bank_feed_checkpoints
      WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
        AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Connection with persisted entries was deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Rejected connection deletion lost transaction evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected connection deletion lost checkpoint evidence'; END IF;
END $test$;

-- Connection identity cannot be reassigned while financial evidence references it.
-- Updating a parent composite key must fail rather than orphan existing entries.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
      SET connection_id = 'renamed-item'
      WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
        AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Referenced connection identity was reassigned';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Rejected identity reassignment lost transaction evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected identity reassignment changed checkpoint'; END IF;
END $test$;

-- A referenced connection cannot be moved to another tenant or provider.
-- Neither update may silently re-scope persisted entries or cursor evidence.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
      SET tenant_id = 'tenant-c'
      WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
        AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Referenced connection was moved to another tenant';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
      SET provider = 'mercury', connection_id = 'scope-moved-item'
      WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
        AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Referenced connection was moved to another provider';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1' AND payload->>'replayed' = 'true'
  ) THEN RAISE EXCEPTION 'Rejected scope reassignment lost transaction evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected scope reassignment changed checkpoint'; END IF;
END $test$;

-- Reject malformed feed payloads and out-of-range cursor evidence at the DB boundary.
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.clearflow_bank_feed_entries
      (tenant_id, provider, connection_id, account_id, transaction_id, payload)
    VALUES ('tenant-a', 'plaid', 'shared-item', 'acct-a', 'tx-array', '[]'::jsonb);
    RAISE EXCEPTION 'Non-object feed payload was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
      SET cursor = repeat('x', 4097)
      WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
        AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Oversized checkpoint cursor was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.clearflow_bank_feed_entries
             WHERE transaction_id = 'tx-array') THEN
    RAISE EXCEPTION 'Rejected malformed payload persisted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clearflow_bank_feed_checkpoints
                 WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
                   AND connection_id = 'shared-item' AND cursor = 'cursor-1') THEN
    RAISE EXCEPTION 'Rejected oversized cursor modified checkpoint';
  END IF;
END $test$;

-- A cursor exactly at the documented 4096-character boundary is valid.
-- Exercise the constraint without retaining synthetic checkpoint state.
BEGIN;
DO $test$
DECLARE affected INTEGER;
BEGIN
  UPDATE public.clearflow_bank_feed_checkpoints
    SET cursor = repeat('x', 4096), revision = revision + 1
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Maximum-length cursor CAS failed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item'
      AND length(cursor) = 4096 AND revision = 2
  ) THEN RAISE EXCEPTION 'Maximum-length cursor was not stored'; END IF;
END $test$;
ROLLBACK;
DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Boundary-test rollback changed committed cursor'; END IF;
END $test$;

-- JavaScript-safe checkpoint revisions must not overflow the database contract.
-- A rejected revision update must leave the last durable cursor untouched.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
      SET revision = 9007199254740992, cursor = 'overflow-cursor'
      WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
        AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Out-of-range checkpoint revision was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND revision = 1 AND cursor = 'cursor-1'
  ) THEN RAISE EXCEPTION 'Rejected revision overflow modified durable checkpoint'; END IF;
END $test$;

SELECT 'PASS: migration idempotence, rollback, replay identity, tenant/provider key isolation, provider cursor CAS and constraints' AS result;
