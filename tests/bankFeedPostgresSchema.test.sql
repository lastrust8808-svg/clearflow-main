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

-- Replaying a matching provider ID under another tenant must never overwrite
-- the original tenant's payload or advance its durable cursor.
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-b', 'plaid', 'shared-item', 'acct-b', 'tx-1',
        '{"amountCents":3500,"tenantBReplay":true}'::jsonb)
ON CONFLICT (tenant_id, provider, connection_id, account_id, transaction_id)
DO UPDATE SET payload = EXCLUDED.payload;

DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-b'
      AND transaction_id = 'tx-1'
      AND payload->>'tenantBReplay' = 'true'
  ) THEN RAISE EXCEPTION 'Tenant B replay was not persisted'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1'
      AND payload->>'replayed' = 'true'
      AND payload->>'tenantBReplay' IS NULL
  ) THEN RAISE EXCEPTION 'Tenant B replay changed tenant A payload'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Tenant B replay changed tenant A checkpoint'; END IF;
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

-- Maximum JavaScript-safe checkpoint revision remains valid and rolls back cleanly.
BEGIN;
DO $test$
DECLARE affected INTEGER;
BEGIN
  UPDATE public.clearflow_bank_feed_checkpoints
    SET revision = 9007199254740991, cursor = 'max-safe-revision'
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND revision = 1 AND cursor = 'cursor-1';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Maximum-safe revision update failed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND revision = 9007199254740991
      AND cursor = 'max-safe-revision'
  ) THEN RAISE EXCEPTION 'Maximum-safe revision was not persisted'; END IF;
END $test$;
ROLLBACK;
DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND revision = 1 AND cursor = 'cursor-1'
  ) THEN RAISE EXCEPTION 'Maximum-safe revision rollback altered checkpoint'; END IF;
END $test$;

-- Account identity boundaries must be enforced independently of transaction identity.
-- The longest permitted account ID is accepted, while a longer ID is rejected.
BEGIN;
DO $test$
BEGIN
  INSERT INTO public.clearflow_bank_feed_entries
    (tenant_id, provider, connection_id, account_id, transaction_id, payload)
  VALUES ('tenant-a', 'plaid', 'shared-item', repeat('a', 256),
          'tx-account-boundary', '{}'::jsonb);
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = repeat('a', 256)
      AND transaction_id = 'tx-account-boundary'
  ) THEN RAISE EXCEPTION 'Maximum-length account identity was not stored'; END IF;
  BEGIN
    INSERT INTO public.clearflow_bank_feed_entries
      (tenant_id, provider, connection_id, account_id, transaction_id, payload)
    VALUES ('tenant-a', 'plaid', 'shared-item', repeat('a', 257),
            'tx-account-overflow', '{}'::jsonb);
    RAISE EXCEPTION 'Oversized account identity was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.clearflow_bank_feed_entries
             WHERE transaction_id = 'tx-account-overflow') THEN
    RAISE EXCEPTION 'Rejected oversized account identity persisted';
  END IF;
END $test$;
ROLLBACK;

-- Transaction identity length must be bounded independently of account identity.
-- Check the accepted boundary and rejection without leaving synthetic entries.
BEGIN;
DO $test$
BEGIN
  INSERT INTO public.clearflow_bank_feed_entries
    (tenant_id, provider, connection_id, account_id, transaction_id, payload)
  VALUES ('tenant-a', 'plaid', 'shared-item', 'acct-a',
          repeat('t', 256), '{}'::jsonb);
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = repeat('t', 256)
  ) THEN RAISE EXCEPTION 'Maximum-length transaction identity was not stored'; END IF;
  BEGIN
    INSERT INTO public.clearflow_bank_feed_entries
      (tenant_id, provider, connection_id, account_id, transaction_id, payload)
    VALUES ('tenant-a', 'plaid', 'shared-item', 'acct-a',
            repeat('t', 257), '{}'::jsonb);
    RAISE EXCEPTION 'Oversized transaction identity was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = repeat('t', 257)
  ) THEN RAISE EXCEPTION 'Rejected oversized transaction identity persisted'; END IF;
END $test$;
ROLLBACK;

-- A previously valid checkpoint must reject a negative revision update atomically.
-- The cursor must not advance when the revision violates the DB constraint.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
      SET revision = -1, cursor = 'invalid-negative-revision'
      WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
        AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Negative checkpoint revision update was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND revision = 1 AND cursor = 'cursor-1'
  ) THEN RAISE EXCEPTION 'Rejected negative revision changed checkpoint'; END IF;
END $test$;

-- Empty checkpoint cursors are not valid resume tokens. A rejected cursor
-- update must preserve both the committed revision and cursor atomically.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
      SET cursor = '', revision = revision + 1
      WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
        AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Empty checkpoint cursor was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected empty cursor changed checkpoint revision or token'; END IF;
END $test$;

-- Empty account identifiers must not create an unmatchable feed entry.
-- Rejection must leave existing transaction evidence untouched.
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.clearflow_bank_feed_entries
      (tenant_id, provider, connection_id, account_id, transaction_id, payload)
    VALUES ('tenant-a', 'plaid', 'shared-item', '',
            'tx-empty-account', '{}'::jsonb);
    RAISE EXCEPTION 'Empty account identifier was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND transaction_id = 'tx-empty-account'
  ) THEN RAISE EXCEPTION 'Rejected empty account identity persisted'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Rejected empty account identity altered existing evidence'; END IF;
END $test$;


-- Empty provider transaction IDs must never be persisted as deduplication keys.
-- The rejection must not affect previously committed transaction evidence.
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.clearflow_bank_feed_entries
      (tenant_id, provider, connection_id, account_id, transaction_id, payload)
    VALUES ('tenant-a', 'plaid', 'shared-item', 'acct-a', '', '{}'::jsonb);
    RAISE EXCEPTION 'Empty transaction identifier was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = ''
  ) THEN RAISE EXCEPTION 'Rejected empty transaction identity persisted'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Rejected empty transaction identity altered existing evidence'; END IF;
END $test$;

-- Persisted feed identities must reject whitespace even if application validation is bypassed.
-- Rejected inserts must not mutate existing committed checkpoint or transaction evidence.
DO $test$
DECLARE bad TEXT;
BEGIN
  FOREACH bad IN ARRAY ARRAY[' ', chr(9), chr(10), ' padded', 'pad ded'] LOOP
    BEGIN
      INSERT INTO public.clearflow_bank_feed_entries
        (tenant_id, provider, connection_id, account_id, transaction_id, payload)
      VALUES ('tenant-a', 'plaid', 'shared-item', 'acct-a', bad, '{}'::jsonb);
      RAISE EXCEPTION 'Whitespace-bearing transaction identifier accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
      INSERT INTO public.clearflow_bank_feed_entries
        (tenant_id, provider, connection_id, account_id, transaction_id, payload)
      VALUES ('tenant-a', 'plaid', 'shared-item', bad, 'tx-invalid-account', '{}'::jsonb);
      RAISE EXCEPTION 'Whitespace-bearing account identifier accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND transaction_id = 'tx-invalid-account'
  ) THEN RAISE EXCEPTION 'Rejected whitespace account persisted'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Whitespace rejection altered committed evidence'; END IF;
END $test$;

-- Tenant and connection scope must reject whitespace at the checkpoint boundary,
-- before any feed entries can be associated with an invalid scope.
DO $test$
DECLARE bad TEXT;
BEGIN
  FOREACH bad IN ARRAY ARRAY[' ', chr(9), chr(10), 'tenant padded', 'tenant' || chr(9) || 'a'] LOOP
    BEGIN
      INSERT INTO public.clearflow_bank_feed_checkpoints
        (tenant_id, provider, connection_id, cursor)
      VALUES (bad, 'plaid', 'scope-invalid-tenant', 'invalid');
      RAISE EXCEPTION 'Whitespace-bearing tenant checkpoint accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
      INSERT INTO public.clearflow_bank_feed_checkpoints
        (tenant_id, provider, connection_id, cursor)
      VALUES ('tenant-a', 'plaid', bad, 'invalid');
      RAISE EXCEPTION 'Whitespace-bearing connection checkpoint accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE connection_id = 'scope-invalid-tenant'
  ) THEN RAISE EXCEPTION 'Rejected tenant checkpoint persisted'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected scope checkpoint altered durable cursor'; END IF;
END $test$;

-- Entry tenant and connection identifiers must be checked independently of checkpoint rows.
-- A malformed scope must never create an entry or change valid committed evidence.
-- Either the identifier CHECK or the checkpoint foreign key may reject the insert;
-- both enforce fail-closed persistence, and PostgreSQL can report the FK first.
DO $test$
DECLARE bad TEXT;
BEGIN
  FOREACH bad IN ARRAY ARRAY[' ', chr(9), chr(10), 'tenant padded', 'tenant' || chr(9) || 'a'] LOOP
    BEGIN
      INSERT INTO public.clearflow_bank_feed_entries
        (tenant_id, provider, connection_id, account_id, transaction_id, payload)
      VALUES (bad, 'plaid', 'shared-item', 'acct-a', 'tx-invalid-tenant', '{}'::jsonb);
      RAISE EXCEPTION 'Whitespace-bearing entry tenant accepted';
    EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL;
    END;
    BEGIN
      INSERT INTO public.clearflow_bank_feed_entries
        (tenant_id, provider, connection_id, account_id, transaction_id, payload)
      VALUES ('tenant-a', 'plaid', bad, 'acct-a', 'tx-invalid-connection', '{}'::jsonb);
      RAISE EXCEPTION 'Whitespace-bearing entry connection accepted';
    EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL;
    END;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE transaction_id IN ('tx-invalid-tenant', 'tx-invalid-connection')
  ) THEN RAISE EXCEPTION 'Rejected entry scope persisted'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Rejected entry scope altered committed evidence'; END IF;
END $test$;

-- A checkpoint containing committed feed evidence must not be deleted.
-- The composite FK is the last-resort guard against losing the replay anchor.
DO $test$
BEGIN
  BEGIN
    DELETE FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Checkpoint with persisted entries was deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Restricted deletion altered durable checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Restricted deletion altered transaction evidence'; END IF;
END $test$;

-- A committed checkpoint scope cannot be re-keyed while feed entries reference it.
-- A rejected scope update must preserve the original replay anchor and evidence.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
       SET connection_id = 'moved-item'
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Referenced checkpoint scope was re-keyed';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected re-key changed original checkpoint'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'moved-item'
  ) THEN RAISE EXCEPTION 'Rejected re-key created moved checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Rejected re-key altered committed feed evidence'; END IF;
END $test$;

-- Provider identity is part of the durable replay scope. Re-keying a referenced
-- checkpoint to another provider must fail without moving the cursor or entries.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
       SET provider = 'mercury'
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Referenced checkpoint provider was re-keyed';
  EXCEPTION WHEN foreign_key_violation OR unique_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected provider re-key altered checkpoint'; END IF;
  -- A Mercury checkpoint already exists for this tenant/connection. Preserve it.
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND cursor = 'mercury-cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected provider re-key altered existing Mercury checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Rejected provider re-key altered feed evidence'; END IF;
END $test$;

-- A referenced checkpoint cannot be reassigned to another tenant. Tenant identity
-- is part of the durable replay key and must remain bound to committed entries.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
       SET tenant_id = 'tenant-moved'
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Referenced checkpoint tenant was re-keyed';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected tenant re-key altered checkpoint'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-moved' AND provider = 'plaid'
       AND connection_id = 'shared-item'
  ) THEN RAISE EXCEPTION 'Rejected tenant re-key created foreign tenant checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Rejected tenant re-key altered committed feed evidence'; END IF;
END $test$;

-- Provider transaction IDs may recur across accounts in the same tenant and connection.
-- An account-scoped replay must not mutate the other account's evidence.
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'plaid', 'shared-item', 'acct-other', 'tx-1',
        '{"amountCents":7900}'::jsonb)
ON CONFLICT (tenant_id, provider, connection_id, account_id, transaction_id)
DO NOTHING;
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'plaid', 'shared-item', 'acct-other', 'tx-1',
        '{"amountCents":7900,"accountReplay":true}'::jsonb)
ON CONFLICT (tenant_id, provider, connection_id, account_id, transaction_id)
DO UPDATE SET payload = EXCLUDED.payload;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.clearflow_bank_feed_entries
      WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
        AND connection_id = 'shared-item' AND transaction_id = 'tx-1') <> 2
  THEN RAISE EXCEPTION 'Account-scoped replay collapsed distinct accounts'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-other'
      AND transaction_id = 'tx-1' AND payload->>'accountReplay' = 'true'
  ) THEN RAISE EXCEPTION 'Account-scoped replay did not persist'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1' AND payload->>'replayed' = 'true'
      AND payload->>'accountReplay' IS NULL
  ) THEN RAISE EXCEPTION 'Account-scoped replay modified another account'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Account-scoped replay moved checkpoint'; END IF;
END $test$;

-- A cursor CAS for a shared connection name must remain tenant-scoped.
-- A successful tenant B advance cannot move tenant A's committed replay anchor.
DO $test$
DECLARE affected INTEGER;
BEGIN
  UPDATE public.clearflow_bank_feed_checkpoints
     SET cursor = 'tenant-b-cursor-1', revision = 1
   WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
     AND connection_id = 'shared-item'
     AND cursor IS NULL AND revision = 0;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Tenant B scoped cursor CAS failed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
      AND connection_id = 'shared-item'
      AND cursor = 'tenant-b-cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Tenant B cursor advance not durable'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item'
      AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Tenant B cursor CAS modified tenant A'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1' AND payload->>'replayed' = 'true'
  ) THEN RAISE EXCEPTION 'Tenant B cursor CAS modified tenant A evidence'; END IF;
END $test$;

-- A stale cursor compare-and-swap must not advance the same tenant twice.
-- Rejected replay must preserve both tenant checkpoints and committed evidence.
DO $test$
DECLARE affected INTEGER;
BEGIN
  UPDATE public.clearflow_bank_feed_checkpoints
     SET cursor = 'tenant-b-stale-replay', revision = 1
   WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
     AND connection_id = 'shared-item'
     AND cursor IS NULL AND revision = 0;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Stale tenant B cursor CAS unexpectedly succeeded'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
      AND connection_id = 'shared-item'
      AND cursor = 'tenant-b-cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Stale cursor replay altered tenant B checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item'
      AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Stale tenant B replay altered tenant A checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1' AND payload->>'replayed' = 'true'
  ) THEN RAISE EXCEPTION 'Stale tenant B replay altered tenant A evidence'; END IF;
END $test$;

-- Committed feed evidence must prevent deletion of its durable replay anchor.
-- The restrictive FK must preserve both the cursor and all account evidence.
DO $test$
BEGIN
  BEGIN
    DELETE FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Referenced checkpoint was deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected deletion changed checkpoint'; END IF;
  IF (SELECT count(*) FROM public.clearflow_bank_feed_entries
       WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
         AND connection_id = 'shared-item' AND transaction_id = 'tx-1') <> 2
  THEN RAISE EXCEPTION 'Rejected deletion changed committed account evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
       AND connection_id = 'shared-item'
       AND cursor = 'tenant-b-cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected deletion affected other tenant'; END IF;
END $test$;

-- Identical provider transaction IDs may occur on different bank providers.
-- Replaying Mercury evidence must not rewrite Plaid evidence or either cursor.
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'mercury', 'shared-item', 'acct-a', 'tx-1',
        '{"amountCents":4500,"source":"mercury"}'::jsonb)
ON CONFLICT (tenant_id, provider, connection_id, account_id, transaction_id)
DO UPDATE SET payload = EXCLUDED.payload;
DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1' AND payload->>'source' = 'mercury'
  ) THEN RAISE EXCEPTION 'Mercury provider-scoped replay not durable'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1' AND payload->>'replayed' = 'true'
      AND payload->>'source' IS NULL
  ) THEN RAISE EXCEPTION 'Mercury replay modified Plaid evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
      AND connection_id = 'shared-item' AND cursor = 'mercury-cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Mercury replay changed Mercury cursor'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Mercury replay changed Plaid cursor'; END IF;
END $test$;

-- A failed feed batch must not leave partial transaction evidence or move its
-- checkpoint. PL/pgSQL exception blocks roll back all writes in the subtransaction.
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.clearflow_bank_feed_entries
      (tenant_id, provider, connection_id, account_id, transaction_id, payload)
    VALUES ('tenant-a', 'plaid', 'shared-item', 'acct-a', 'tx-rollback-probe',
            '{"amountCents":1234}'::jsonb);
    UPDATE public.clearflow_bank_feed_checkpoints
       SET cursor = 'uncommitted-batch', revision = 2
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND revision = 1;
    -- No checkpoint exists for this connection: force a referential failure.
    INSERT INTO public.clearflow_bank_feed_entries
      (tenant_id, provider, connection_id, account_id, transaction_id, payload)
    VALUES ('tenant-a', 'plaid', 'missing-batch-checkpoint', 'acct-a',
            'tx-rollback-invalid', '{}'::jsonb);
    RAISE EXCEPTION 'Invalid feed batch unexpectedly committed';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND transaction_id = 'tx-rollback-probe'
  ) THEN RAISE EXCEPTION 'Failed feed batch leaked partial transaction'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Failed feed batch advanced checkpoint'; END IF;
END $test$;

-- Failed batches must preserve unrelated tenant and provider checkpoints as well.
-- This guards against a broad rollback/recovery update after a provider error.
DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'tenant-b-cursor-1'
      AND revision = 1
  ) THEN RAISE EXCEPTION 'Failed batch changed another tenant checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
      AND connection_id = 'shared-item' AND cursor = 'mercury-cursor-1'
      AND revision = 1
  ) THEN RAISE EXCEPTION 'Failed Plaid batch changed Mercury checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1' AND payload->>'source' = 'mercury'
  ) THEN RAISE EXCEPTION 'Failed Plaid batch changed Mercury evidence'; END IF;
END $test$;

-- A failed batch that updates previously committed evidence must restore the old
-- payload as well as the cursor. Insert-only rollback tests cannot catch this.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_entries
       SET payload = '{"amountCents":9999,"uncommitted":true}'::jsonb
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1';
    UPDATE public.clearflow_bank_feed_checkpoints
       SET cursor = 'mercury-uncommitted', revision = 2
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND revision = 1;
    INSERT INTO public.clearflow_bank_feed_entries
      (tenant_id, provider, connection_id, account_id, transaction_id, payload)
    VALUES ('tenant-a', 'mercury', 'missing-update-checkpoint', 'acct-a',
            'tx-invalid-update', '{}'::jsonb);
    RAISE EXCEPTION 'Invalid Mercury update batch unexpectedly committed';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
    WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
      AND connection_id = 'shared-item' AND account_id = 'acct-a'
      AND transaction_id = 'tx-1' AND payload->>'source' = 'mercury'
      AND payload->>'amountCents' = '4500'
      AND payload->>'uncommitted' IS NULL
  ) THEN RAISE EXCEPTION 'Failed update batch changed committed Mercury evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
      AND connection_id = 'shared-item' AND cursor = 'mercury-cursor-1'
      AND revision = 1
  ) THEN RAISE EXCEPTION 'Failed update batch advanced Mercury checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
      AND connection_id = 'shared-item' AND cursor = 'cursor-1' AND revision = 1
  ) THEN RAISE EXCEPTION 'Failed Mercury update affected Plaid checkpoint'; END IF;
END $test$;


-- Cursor revision must remain within the JavaScript safe-integer range.
-- Rejected overflow and negative revisions cannot corrupt a durable checkpoint.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
       SET revision = 9007199254740992
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Unsafe revision overflow unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
       SET revision = -1
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Negative revision unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
    WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
      AND connection_id = 'shared-item' AND revision = 1
      AND cursor = 'mercury-cursor-1'
  ) THEN RAISE EXCEPTION 'Invalid revisions modified durable Mercury checkpoint'; END IF;
END $test$;

-- The maximum exactly representable revision must be accepted, while the
-- next revision is rejected without changing the cursor or other providers.
DO $test$
BEGIN
  UPDATE public.clearflow_bank_feed_checkpoints
     SET revision = 9007199254740991
   WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
     AND connection_id = 'shared-item' AND revision = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Safe upper-bound revision was not accepted'; END IF;
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
       SET revision = revision + 1, cursor = 'overflow-cursor'
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Revision increment beyond safe bound unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND revision = 9007199254740991
       AND cursor = 'mercury-cursor-1'
  ) THEN RAISE EXCEPTION 'Overflow increment changed maximum safe checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND revision = 1 AND cursor = 'cursor-1'
  ) THEN RAISE EXCEPTION 'Overflow increment modified Plaid checkpoint'; END IF;
END $test$;

-- Feed payloads must be JSON objects. Rejecting arrays and scalar replacements
-- must preserve committed transaction evidence and the provider checkpoint.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_entries
       SET payload = '[{"amountCents":9999}]'::jsonb
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1';
    RAISE EXCEPTION 'Array payload unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.clearflow_bank_feed_entries
       SET payload = '"replaced"'::jsonb
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1';
    RAISE EXCEPTION 'Scalar payload unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":4500,"source":"mercury"}'::jsonb
  ) THEN RAISE EXCEPTION 'Invalid payload replacement changed committed evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item'
       AND revision = 9007199254740991 AND cursor = 'mercury-cursor-1'
  ) THEN RAISE EXCEPTION 'Invalid payload replacement changed checkpoint'; END IF;
END $test$;

-- SQL NULL and JSON null are distinct invalid payloads. Neither may erase
-- committed provider evidence or advance its durable cursor.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_entries
       SET payload = NULL
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1';
    RAISE EXCEPTION 'SQL NULL payload unexpectedly accepted';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.clearflow_bank_feed_entries
       SET payload = 'null'::jsonb
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1';
    RAISE EXCEPTION 'JSON null payload unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":4500,"source":"mercury"}'::jsonb
  ) THEN RAISE EXCEPTION 'Null payload attempt changed committed evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item'
       AND revision = 9007199254740991 AND cursor = 'mercury-cursor-1'
  ) THEN RAISE EXCEPTION 'Null payload attempt changed durable checkpoint'; END IF;
END $test$;

-- A cursor must be either SQL NULL (initial sync) or a nonempty bounded token.
-- Invalid cursor updates cannot advance the committed checkpoint revision.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
       SET cursor = '', revision = 2
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND revision = 1;
    RAISE EXCEPTION 'Empty synchronization cursor unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.clearflow_bank_feed_checkpoints
       SET cursor = repeat('x', 4097), revision = 2
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND revision = 1;
    RAISE EXCEPTION 'Oversized synchronization cursor unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND cursor = 'cursor-1'
       AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected cursor update changed committed Plaid checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND cursor = 'mercury-cursor-1'
       AND revision = 9007199254740991
  ) THEN RAISE EXCEPTION 'Rejected Plaid cursor affected Mercury checkpoint'; END IF;
END $test$;

-- Exactly 4,096 cursor characters must be accepted; the bound is inclusive.
-- Restore the prior committed token to keep subsequent fixture expectations stable.
DO $test$
BEGIN
  UPDATE public.clearflow_bank_feed_checkpoints
     SET cursor = repeat('x', 4096), revision = 2
   WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
     AND connection_id = 'shared-item' AND revision = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maximum-length cursor update did not match checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND revision = 2
       AND length(cursor) = 4096 AND cursor = repeat('x', 4096)
  ) THEN RAISE EXCEPTION 'Maximum-length cursor was not persisted'; END IF;
  UPDATE public.clearflow_bank_feed_checkpoints
     SET cursor = 'cursor-1', revision = 3
   WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
     AND connection_id = 'shared-item' AND revision = 2;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cursor restoration failed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item'
       AND cursor = 'mercury-cursor-1' AND revision = 9007199254740991
  ) THEN RAISE EXCEPTION 'Boundary cursor update changed Mercury checkpoint'; END IF;
END $test$;

-- A committed feed entry must prevent deleting its parent provider checkpoint.
-- FK RESTRICT must leave both evidence and the cursor intact, without affecting
-- the independent provider sharing the same connection identifier.
DO $test$
BEGIN
  BEGIN
    DELETE FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item';
    RAISE EXCEPTION 'Checkpoint with committed feed evidence unexpectedly deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":4500,"source":"mercury"}'::jsonb
  ) THEN RAISE EXCEPTION 'Rejected checkpoint deletion lost committed Mercury evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND revision = 9007199254740991
       AND cursor = 'mercury-cursor-1'
  ) THEN RAISE EXCEPTION 'Rejected deletion changed Mercury checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND revision = 3
       AND cursor = 'cursor-1'
  ) THEN RAISE EXCEPTION 'Rejected Mercury deletion changed Plaid checkpoint'; END IF;
END $test$;

-- Reparenting committed evidence to an absent provider checkpoint must fail.
-- The composite foreign key must preserve the original transaction and both
-- independent provider cursors even when connection identifiers are reused.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_entries
       SET connection_id = 'missing-connection'
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1';
    RAISE EXCEPTION 'Orphaned bank-feed evidence unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":4500,"source":"mercury"}'::jsonb
  ) THEN RAISE EXCEPTION 'Rejected evidence reparenting altered committed transaction'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND revision = 9007199254740991
       AND cursor = 'mercury-cursor-1'
  ) THEN RAISE EXCEPTION 'Rejected reparenting changed Mercury checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND revision = 3
       AND cursor = 'cursor-1'
  ) THEN RAISE EXCEPTION 'Rejected reparenting changed Plaid checkpoint'; END IF;
END $test$;


-- Committed feed evidence must not be reassigned to an absent tenant checkpoint.
-- The composite foreign key must reject the mutation atomically.
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_entries
       SET tenant_id = 'missing-tenant'
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1';
    RAISE EXCEPTION 'Cross-tenant orphaned feed evidence unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":4500,"source":"mercury"}'::jsonb
  ) THEN RAISE EXCEPTION 'Rejected tenant reassignment changed committed evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND revision = 1
       AND cursor = 'tenant-b-cursor-1'
  ) THEN RAISE EXCEPTION 'Rejected tenant reassignment changed other tenant checkpoint'; END IF;
END $test$;


-- A plain duplicate insert (without an explicit replay upsert) must fail closed.
-- The rejected collision must not replace committed evidence or advance cursors.
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.clearflow_bank_feed_entries
      (tenant_id, provider, connection_id, account_id, transaction_id, payload)
    VALUES ('tenant-a', 'mercury', 'shared-item', 'acct-a', 'tx-1',
            '{"amountCents":999999,"source":"collision"}'::jsonb);
    RAISE EXCEPTION 'Duplicate provider transaction identity unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.clearflow_bank_feed_entries
       WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
         AND connection_id = 'shared-item' AND account_id = 'acct-a'
         AND transaction_id = 'tx-1') <> 1 THEN
    RAISE EXCEPTION 'Duplicate collision changed transaction cardinality';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":4500,"source":"mercury"}'::jsonb
  ) THEN RAISE EXCEPTION 'Duplicate collision overwrote committed evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND revision = 9007199254740991
       AND cursor = 'mercury-cursor-1'
  ) THEN RAISE EXCEPTION 'Duplicate collision changed Mercury checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND revision = 3
       AND cursor = 'cursor-1'
  ) THEN RAISE EXCEPTION 'Duplicate collision changed Plaid checkpoint'; END IF;
END $test$;

-- Account identity is part of the replay key. A provider may reuse a transaction
-- identifier on a different account without mutating the original evidence.
-- Keep this fixture inside a transaction so existing row-count assertions remain stable.
BEGIN;
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'mercury', 'shared-item', 'acct-second', 'tx-1',
        '{"amountCents":7600,"source":"second-account"}'::jsonb);
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.clearflow_bank_feed_entries
      WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
        AND connection_id = 'shared-item' AND transaction_id = 'tx-1') <> 2
  THEN RAISE EXCEPTION 'Distinct bank accounts incorrectly share replay identity'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":4500,"source":"mercury"}'::jsonb
  ) THEN RAISE EXCEPTION 'Second-account insert changed original account evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-second'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":7600,"source":"second-account"}'::jsonb
  ) THEN RAISE EXCEPTION 'Second-account evidence was not persisted'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND revision = 9007199254740991
       AND cursor = 'mercury-cursor-1'
  ) THEN RAISE EXCEPTION 'Second-account insert advanced provider checkpoint'; END IF;
END $test$;
ROLLBACK;

-- Provider identity is part of the replay key. Mercury and Plaid may use
-- the same account and transaction identifiers without evidence collision.
-- Roll back the fixture to preserve downstream repeatability.
BEGIN;
-- Use a fresh identity because the baseline fixture already contains Plaid tx-1.
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'mercury', 'shared-item', 'acct-a', 'tx-provider-isolation',
        '{"amountCents":4500,"source":"mercury"}'::jsonb);
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'plaid', 'shared-item', 'acct-a', 'tx-provider-isolation',
        '{"amountCents":8100,"source":"plaid"}'::jsonb);
DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-provider-isolation'
       AND payload = '{"amountCents":4500,"source":"mercury"}'::jsonb
  ) THEN RAISE EXCEPTION 'Plaid replay identity collided with Mercury evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-provider-isolation'
       AND payload = '{"amountCents":8100,"source":"plaid"}'::jsonb
  ) THEN RAISE EXCEPTION 'Independent Plaid transaction evidence missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND revision = 3
       AND cursor = 'cursor-1'
  ) THEN RAISE EXCEPTION 'Provider-isolated insert advanced Plaid checkpoint'; END IF;
END $test$;
ROLLBACK;


-- Tenant identity must isolate replay keys even when provider, connection,
-- account, and transaction identifiers are identical across tenants.
BEGIN;
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-b', 'plaid', 'shared-item', 'acct-a', 'tx-1',
        '{"amountCents":9900,"source":"tenant-b"}'::jsonb);
DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":9900,"source":"tenant-b"}'::jsonb
  ) THEN RAISE EXCEPTION 'Other tenant replay identity was not persisted'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Other tenant insert displaced original Plaid evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND revision = 1
       AND cursor = 'tenant-b-cursor-1'
  ) THEN RAISE EXCEPTION 'Other tenant insert changed its checkpoint'; END IF;
END $test$;
ROLLBACK;

-- Connection identity must isolate replay keys for the same tenant/provider/account.
-- A second authorized connection can use the same transaction ID without overwriting
-- the original connection's evidence or advancing its checkpoint.
BEGIN;
INSERT INTO public.clearflow_bank_feed_checkpoints
  (tenant_id, provider, connection_id, cursor, revision)
VALUES ('tenant-a', 'plaid', 'second-item', 'second-cursor', 7);
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'plaid', 'second-item', 'acct-a', 'tx-1',
        '{"amountCents":1234,"source":"second-connection"}'::jsonb);
DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'second-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":1234,"source":"second-connection"}'::jsonb
  ) THEN RAISE EXCEPTION 'Second connection evidence missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Second connection displaced original evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND cursor = 'cursor-1'
       AND revision = 3
  ) THEN RAISE EXCEPTION 'Second connection advanced original checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'second-item' AND cursor = 'second-cursor'
       AND revision = 7
  ) THEN RAISE EXCEPTION 'Second connection checkpoint changed'; END IF;
END $test$;
ROLLBACK;

-- A replay identity must not be changed to collide with an existing account's
-- committed transaction. A rejected account reassignment preserves both rows.
BEGIN;
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'mercury', 'shared-item', 'acct-reassignment', 'tx-1',
        '{"amountCents":7300,"source":"reassignment-fixture"}'::jsonb);
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_entries
       SET account_id = 'acct-a'
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-reassignment'
       AND transaction_id = 'tx-1';
    RAISE EXCEPTION 'Account reassignment unexpectedly overwrote replay identity';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":4500,"source":"mercury"}'::jsonb
  ) THEN RAISE EXCEPTION 'Rejected reassignment changed original account evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-reassignment'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":7300,"source":"reassignment-fixture"}'::jsonb
  ) THEN RAISE EXCEPTION 'Rejected reassignment changed source account evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND cursor = 'mercury-cursor-1'
       AND revision = 9007199254740991
  ) THEN RAISE EXCEPTION 'Rejected reassignment advanced Mercury checkpoint'; END IF;
END $test$;
ROLLBACK;


-- Reassigning a transaction ID to an already committed replay key must fail
-- without mutating either record or advancing the provider cursor.
BEGIN;
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'mercury', 'shared-item', 'acct-a', 'tx-id-reassignment',
        '{"amountCents":6200,"source":"id-reassignment-fixture"}'::jsonb);
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_entries
       SET transaction_id = 'tx-1'
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-id-reassignment';
    RAISE EXCEPTION 'Transaction ID reassignment unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":4500,"source":"mercury"}'::jsonb
  ) THEN RAISE EXCEPTION 'Rejected transaction ID reassignment modified committed evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-id-reassignment'
       AND payload = '{"amountCents":6200,"source":"id-reassignment-fixture"}'::jsonb
  ) THEN RAISE EXCEPTION 'Rejected transaction ID reassignment modified source evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND cursor = 'mercury-cursor-1'
       AND revision = 9007199254740991
  ) THEN RAISE EXCEPTION 'Rejected transaction ID reassignment advanced checkpoint'; END IF;
END $test$;
ROLLBACK;

-- Changing the provider to an existing replay identity must be rejected.
-- A failed provider reassignment must not change either provider's evidence or cursor.
BEGIN;
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'mercury', 'shared-item', 'acct-a', 'tx-provider-reassignment',
        '{"amountCents":6700,"source":"provider-reassignment"}'::jsonb);
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-a', 'plaid', 'shared-item', 'acct-a', 'tx-provider-reassignment',
        '{"amountCents":8900,"source":"plaid-provider-reassignment"}'::jsonb);
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_entries
       SET provider = 'plaid'
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-provider-reassignment';
    RAISE EXCEPTION 'Provider reassignment unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.clearflow_bank_feed_entries
       WHERE tenant_id = 'tenant-a' AND connection_id = 'shared-item'
         AND account_id = 'acct-a' AND transaction_id = 'tx-provider-reassignment') <> 2
  THEN RAISE EXCEPTION 'Rejected provider reassignment changed row count'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-provider-reassignment'
       AND payload = '{"amountCents":6700,"source":"provider-reassignment"}'::jsonb
  ) THEN RAISE EXCEPTION 'Rejected provider reassignment changed Mercury evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-provider-reassignment'
       AND payload = '{"amountCents":8900,"source":"plaid-provider-reassignment"}'::jsonb
  ) THEN RAISE EXCEPTION 'Rejected provider reassignment changed Plaid evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'mercury'
       AND connection_id = 'shared-item' AND cursor = 'mercury-cursor-1'
       AND revision = 9007199254740991
  ) THEN RAISE EXCEPTION 'Rejected provider reassignment advanced Mercury cursor'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND cursor = 'cursor-1'
       AND revision = 3
  ) THEN RAISE EXCEPTION 'Rejected provider reassignment advanced Plaid cursor'; END IF;
END $test$;
ROLLBACK;

-- Tenant reassignment into an occupied replay key must fail closed, retaining
-- both tenants' evidence and their independent synchronization checkpoints.
BEGIN;
INSERT INTO public.clearflow_bank_feed_entries
  (tenant_id, provider, connection_id, account_id, transaction_id, payload)
VALUES ('tenant-b', 'plaid', 'shared-item', 'acct-a', 'tx-1',
        '{"amountCents":8100,"source":"tenant-reassignment-fixture"}'::jsonb);
DO $test$
BEGIN
  BEGIN
    UPDATE public.clearflow_bank_feed_entries
       SET tenant_id = 'tenant-a'
     WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1';
    RAISE EXCEPTION 'Tenant reassignment unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.clearflow_bank_feed_entries
       WHERE provider = 'plaid' AND connection_id = 'shared-item'
         AND account_id = 'acct-a' AND transaction_id = 'tx-1') <> 2
  THEN RAISE EXCEPTION 'Rejected tenant reassignment changed row count'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
  ) THEN RAISE EXCEPTION 'Rejected tenant reassignment displaced original evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_entries
     WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND account_id = 'acct-a'
       AND transaction_id = 'tx-1'
       AND payload = '{"amountCents":8100,"source":"tenant-reassignment-fixture"}'::jsonb
  ) THEN RAISE EXCEPTION 'Rejected tenant reassignment changed source evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-a' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND cursor = 'cursor-1'
       AND revision = 3
  ) THEN RAISE EXCEPTION 'Rejected tenant reassignment advanced original checkpoint'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clearflow_bank_feed_checkpoints
     WHERE tenant_id = 'tenant-b' AND provider = 'plaid'
       AND connection_id = 'shared-item' AND cursor = 'tenant-b-cursor-1'
       AND revision = 1
  ) THEN RAISE EXCEPTION 'Rejected tenant reassignment changed source checkpoint'; END IF;
END $test$;
ROLLBACK;

SELECT 'PASS: migration idempotence, rollback, replay identity, tenant/provider key isolation, provider cursor CAS and constraints' AS result;
