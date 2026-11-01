#!/usr/bin/env bash
# Disposable PostgreSQL 16 acceptance: concurrent ERP workers must not claim
# the same tenant-scoped queued job. SQL mirrors claimErpOperationJob.
# This does not execute a worker, deliver an invoice, or initiate a payment.
set -euo pipefail

tenant_a='ci-claim-race-tenant-a'
tenant_b='ci-claim-race-tenant-b'
fixture_key='ci-claim-race-fixture'
tmpdir=$(mktemp -d)
first_pid=''

cleanup() {
  if [[ -n "$first_pid" ]] && kill -0 "$first_pid" 2>/dev/null; then
    kill "$first_pid" 2>/dev/null || true
    wait "$first_pid" 2>/dev/null || true
  fi
  psql -X -v ON_ERROR_STOP=1 -q -c "DELETE FROM erp_operation_jobs
    WHERE tenant_id IN ('${tenant_a}', '${tenant_b}')
      AND idempotency_key = '${fixture_key}'" >/dev/null || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT

psql -X -v ON_ERROR_STOP=1 -q -c "INSERT INTO erp_operation_jobs
  (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
  VALUES ('${tenant_a}', 'ci-actor', 'invoice_delivery', '${fixture_key}',
          repeat('a', 64), '{}'::jsonb),
         ('${tenant_b}', 'ci-actor', 'invoice_delivery', '${fixture_key}',
          repeat('b', 64), '{}'::jsonb)"

# Connection 1 claims tenant A and deliberately holds the row lock inside
# its uncommitted transaction. The shell marker is emitted only after the
# UPDATE has completed; there is no timing-based assumption about readiness.
psql -X -v ON_ERROR_STOP=1 -At >"$tmpdir/first.log" 2>&1 <<SQL &
BEGIN;
WITH next_job AS (
  SELECT id FROM erp_operation_jobs
  WHERE tenant_id = '${tenant_a}' AND operation = 'invoice_delivery'
    AND status = 'queued' AND dispatch_started_at IS NULL
    AND failure_code IS NULL AND claimed_by IS NULL
    AND claimed_at IS NULL AND lease_expires_at IS NULL
  ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
)
UPDATE erp_operation_jobs AS job
SET status = 'processing', claimed_by = 'ci-worker-one',
    claimed_at = now(), lease_expires_at = now() + interval '60 seconds',
    updated_at = now()
FROM next_job
WHERE job.id = next_job.id AND job.tenant_id = '${tenant_a}'
  AND job.operation = 'invoice_delivery' AND job.status = 'queued'
  AND job.dispatch_started_at IS NULL AND job.failure_code IS NULL
  AND job.claimed_by IS NULL AND job.claimed_at IS NULL
  AND job.lease_expires_at IS NULL
RETURNING job.id;
\! touch $tmpdir/ready
SELECT pg_sleep(12);
COMMIT;
SQL
first_pid=$!

for attempt in {1..80}; do
  [[ -f "$tmpdir/ready" ]] && break
  if ! kill -0 "$first_pid" 2>/dev/null; then
    cat "$tmpdir/first.log" >&2
    echo 'FAIL: first worker exited before acquiring its lock' >&2
    exit 1
  fi
  sleep 0.1
done
if [[ ! -f "$tmpdir/ready" ]]; then
  cat "$tmpdir/first.log" >&2
  echo 'FAIL: first worker never signaled a held PostgreSQL row lock' >&2
  exit 1
fi

# Connection 2 must SKIP the locked tenant-A row, not wait or claim it.
# A statement timeout turns a missing SKIP LOCKED into a failing test.
second_claim=$(PGOPTIONS='-c statement_timeout=1500' psql -X -v ON_ERROR_STOP=1 -At -c "
WITH next_job AS (
  SELECT id FROM erp_operation_jobs
  WHERE tenant_id = '${tenant_a}' AND operation = 'invoice_delivery'
    AND status = 'queued' AND dispatch_started_at IS NULL
    AND failure_code IS NULL AND claimed_by IS NULL
    AND claimed_at IS NULL AND lease_expires_at IS NULL
  ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
), claimed AS (
  UPDATE erp_operation_jobs AS job
  SET status = 'processing', claimed_by = 'ci-worker-two',
      claimed_at = now(), lease_expires_at = now() + interval '60 seconds',
      updated_at = now()
  FROM next_job
  WHERE job.id = next_job.id AND job.tenant_id = '${tenant_a}'
    AND job.operation = 'invoice_delivery' AND job.status = 'queued'
    AND job.dispatch_started_at IS NULL AND job.failure_code IS NULL
    AND job.claimed_by IS NULL AND job.claimed_at IS NULL
    AND job.lease_expires_at IS NULL
  RETURNING job.id
) SELECT count(*) FROM claimed;")
if [[ "$second_claim" != '0' ]]; then
  echo "FAIL: competing worker claimed a locked job (count=$second_claim)" >&2
  exit 1
fi

# The same idempotency key belongs to a separate tenant; its worker may
# claim independently while tenant A's transaction still holds the lock.
other_tenant=$(PGOPTIONS='-c statement_timeout=1500' psql -X -v ON_ERROR_STOP=1 -At -c "
WITH next_job AS (
  SELECT id FROM erp_operation_jobs
  WHERE tenant_id = '${tenant_b}' AND operation = 'invoice_delivery'
    AND status = 'queued' AND dispatch_started_at IS NULL
    AND failure_code IS NULL AND claimed_by IS NULL
    AND claimed_at IS NULL AND lease_expires_at IS NULL
  ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
), claimed AS (
  UPDATE erp_operation_jobs AS job
  SET status = 'processing', claimed_by = 'ci-worker-tenant-b',
      claimed_at = now(), lease_expires_at = now() + interval '60 seconds',
      updated_at = now()
  FROM next_job
  WHERE job.id = next_job.id AND job.tenant_id = '${tenant_b}'
    AND job.operation = 'invoice_delivery' AND job.status = 'queued'
    AND job.dispatch_started_at IS NULL AND job.failure_code IS NULL
    AND job.claimed_by IS NULL AND job.claimed_at IS NULL
    AND job.lease_expires_at IS NULL
  RETURNING job.id
) SELECT count(*) FROM claimed;")
if [[ "$other_tenant" != '1' ]]; then
  echo "FAIL: independent tenant could not claim its own job (count=$other_tenant)" >&2
  exit 1
fi

wait "$first_pid"
first_pid=''
if ! grep -Eq '^[0-9a-f]{8}-[0-9a-f-]{27,}$' "$tmpdir/first.log"; then
  cat "$tmpdir/first.log" >&2
  echo 'FAIL: first worker did not return a job UUID' >&2
  exit 1
fi

persisted=$(psql -X -v ON_ERROR_STOP=1 -At -c "
SELECT count(*) FROM erp_operation_jobs
WHERE idempotency_key = '${fixture_key}' AND operation = 'invoice_delivery'
  AND status = 'processing' AND dispatch_started_at IS NULL
  AND failure_code IS NULL AND claimed_at IS NOT NULL
  AND lease_expires_at > claimed_at
  AND ((tenant_id = '${tenant_a}' AND claimed_by = 'ci-worker-one')
    OR (tenant_id = '${tenant_b}' AND claimed_by = 'ci-worker-tenant-b'));")
if [[ "$persisted" != '2' ]]; then
  echo "FAIL: concurrent claims did not persist independently (count=$persisted)" >&2
  exit 1
fi

echo 'PASS: concurrent PostgreSQL workers cannot double-claim a locked ERP job; tenant B claims independently.'
