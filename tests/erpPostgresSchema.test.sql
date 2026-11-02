-- Disposable PostgreSQL 16 acceptance smoke for the proposed ERP job schema.
-- Executed only against the GitHub Actions service database; transaction rolls back.
-- This does NOT apply a production migration or prove worker/provider integration.
BEGIN;

INSERT INTO erp_operation_jobs
  (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
VALUES ('tenant-a', 'actor-a', 'invoice_delivery', 'invoice-key',
        repeat('a', 64), '{"invoiceId":"invoice-1"}'::jsonb);

DO $test$
DECLARE
  bad_identity text;
BEGIN
  -- A database reservation must never be accepted without a meaningful
  -- tenant, actor, or idempotency identity. These checks protect persisted
  -- rows even if a future caller bypasses the service-side validation.
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('   ', 'actor-a', 'invoice_delivery', 'blank-tenant',
            repeat('a', 64), '{}'::jsonb);
    RAISE EXCEPTION 'whitespace-only tenant was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('tenant-a', '  ', 'invoice_delivery', 'blank-actor',
            repeat('a', 64), '{}'::jsonb);
    RAISE EXCEPTION 'whitespace-only actor was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('tenant-a', 'actor-a', 'invoice_delivery', '  ',
            repeat('a', 64), '{}'::jsonb);
    RAISE EXCEPTION 'whitespace-only idempotency key was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- POSIX whitespace includes tabs/newlines, not only ASCII spaces.
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES (E'\t', 'actor-a', 'invoice_delivery', 'tab-tenant',
            repeat('a', 64), '{}'::jsonb);
    RAISE EXCEPTION 'tab-only tenant was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('tenant-a', E'\n', 'invoice_delivery', 'newline-actor',
            repeat('a', 64), '{}'::jsonb);
    RAISE EXCEPTION 'newline-only actor was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('tenant-a', 'actor-a', 'invoice_delivery', E'\t\n',
            repeat('a', 64), '{}'::jsonb);
    RAISE EXCEPTION 'tab/newline-only idempotency key was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Nonempty but malformed identities must fail at the DB boundary too.
  -- These rows bypass the JS reservation service to exercise SQL constraints.
  FOR bad_identity IN SELECT unnest(ARRAY[
    ' leading-tenant', 'trailing-tenant ', E'tenant\tcontrol',
    repeat('t', 256)
  ]) LOOP
    BEGIN
      INSERT INTO erp_operation_jobs
        (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
      VALUES (bad_identity, 'actor-a', 'invoice_delivery', 'invalid-tenant-test',
              repeat('a', 64), '{}'::jsonb);
      RAISE EXCEPTION 'invalid tenant identity was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
  FOR bad_identity IN SELECT unnest(ARRAY[
    ' leading-actor', 'trailing-actor ', E'actor\ncontrol',
    repeat('a', 256)
  ]) LOOP
    BEGIN
      INSERT INTO erp_operation_jobs
        (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
      VALUES ('tenant-a', bad_identity, 'invoice_delivery', 'invalid-actor-test',
              repeat('a', 64), '{}'::jsonb);
      RAISE EXCEPTION 'invalid actor identity was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
  FOR bad_identity IN SELECT unnest(ARRAY[
    'short', 'bad key', E'bad\tkey', repeat('k', 129)
  ]) LOOP
    BEGIN
      INSERT INTO erp_operation_jobs
        (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
      VALUES ('tenant-a', 'actor-a', 'invoice_delivery', bad_identity,
              repeat('a', 64), '{}'::jsonb);
      RAISE EXCEPTION 'invalid idempotency key was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;

  -- The exact lowercase 64-character digest is part of the durable
  -- idempotency receipt. Uppercase, non-hex, and truncated digests fail.
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('tenant-a', 'actor-a', 'invoice_delivery', 'uppercase-digest',
            repeat('A', 64), '{}'::jsonb);
    RAISE EXCEPTION 'uppercase payload digest was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('tenant-a', 'actor-a', 'invoice_delivery', 'nonhex-digest',
            repeat('g', 64), '{}'::jsonb);
    RAISE EXCEPTION 'non-hex payload digest was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('tenant-a', 'actor-a', 'invoice_delivery', 'short-digest',
            'abc', '{}'::jsonb);
    RAISE EXCEPTION 'truncated payload digest was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Idempotency is tenant + operation scoped, not a global key.
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('tenant-a', 'actor-a', 'invoice_delivery', 'invoice-key',
            repeat('a', 64), '{}'::jsonb);
    RAISE EXCEPTION 'duplicate tenant/operation/idempotency key was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- A database row cannot claim successful delivery without durable evidence.
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload, status)
    VALUES ('tenant-a', 'actor-a', 'invoice_delivery', 'fake-success',
            repeat('a', 64), '{}'::jsonb, 'sent');
    RAISE EXCEPTION 'evidence-free sent status was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- A queued job must not retain a stale worker lease or failure reason.
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload,
       claimed_by, claimed_at, lease_expires_at)
    VALUES ('tenant-a', 'actor-a', 'invoice_delivery', 'stale-lease',
            repeat('a', 64), '{}'::jsonb, 'worker-a',
            '2026-10-29T12:00:00Z', '2026-10-29T12:01:00Z');
    RAISE EXCEPTION 'queued job with a stale worker lease was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload,
       failure_code)
    VALUES ('tenant-a', 'actor-a', 'invoice_delivery', 'stale-failure',
            repeat('a', 64), '{}'::jsonb, 'ERP_WORKER_ERROR');
    RAISE EXCEPTION 'queued job with a failure code was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload, status)
    VALUES ('tenant-a', 'actor-a', 'invoice_delivery', 'lease-missing',
            repeat('a', 64), '{}'::jsonb, 'processing');
    RAISE EXCEPTION 'processing job without a worker lease was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$test$;

-- The same idempotency key can be used by another tenant.
INSERT INTO erp_operation_jobs
  (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
VALUES ('tenant-b', 'actor-b', 'invoice_delivery', 'invoice-key',
        repeat('b', 64), '{}'::jsonb);

-- A valid processing lease can persist its pre-dispatch fence.
INSERT INTO erp_operation_jobs
  (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload,
   status, claimed_by, claimed_at, lease_expires_at)
VALUES ('tenant-a', 'actor-a', 'invoice_delivery', 'fenced-job',
        repeat('c', 64), '{}'::jsonb, 'processing', 'worker-a',
        '2026-10-29T12:00:00Z', '2026-10-29T12:01:00Z');

UPDATE erp_operation_jobs
SET dispatch_started_at = '2026-10-29T12:00:30Z'
WHERE tenant_id = 'tenant-a' AND idempotency_key = 'fenced-job';

DO $test$
BEGIN
  -- A possibly dispatched job must not be relabeled as a confirmed failure.
  BEGIN
    UPDATE erp_operation_jobs
    SET status = 'failed', failure_code = 'ERP_WORKER_ERROR',
        claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL
    WHERE tenant_id = 'tenant-a' AND idempotency_key = 'fenced-job';
    RAISE EXCEPTION 'dispatched job was incorrectly marked failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$test$;

-- Unknown-outcome quarantine retains dispatch evidence but clears the lease.
UPDATE erp_operation_jobs
SET status = 'outcome_unknown',
    claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL
WHERE tenant_id = 'tenant-a' AND idempotency_key = 'fenced-job';

DO $test$
BEGIN
  IF (SELECT count(*) FROM erp_operation_jobs
      WHERE idempotency_key = 'invoice-key') <> 2 THEN
    RAISE EXCEPTION 'tenant-scoped idempotency rows missing';
  END IF;
  IF (SELECT count(*) FROM erp_operation_jobs
      WHERE tenant_id = 'tenant-a' AND idempotency_key = 'fenced-job'
        AND status = 'outcome_unknown' AND dispatch_started_at IS NOT NULL
        AND claimed_by IS NULL AND claimed_at IS NULL AND lease_expires_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'dispatch evidence was not preserved during quarantine';
  END IF;
END
$test$;

ROLLBACK;
