#!/usr/bin/env bash
# Disposable CI PostgreSQL acceptance: committed ERP reservations and claims
# survive separate client connections. No worker/provider side effects.
set -euo pipefail

fixture_key='ci-session-durability-1'
fixture_tenant='ci-session-tenant'
cleanup() {
  psql -X -v ON_ERROR_STOP=1 -q -c     "DELETE FROM erp_operation_jobs WHERE tenant_id = '${fixture_tenant}' AND idempotency_key = '${fixture_key}'"     >/dev/null || true
}
trap cleanup EXIT

# Session 1 commits a reservation. psql exits and closes the connection.
created_id=$(psql -X -v ON_ERROR_STOP=1 -At -c "
  WITH inserted AS (
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('${fixture_tenant}', 'ci-actor', 'invoice_delivery', '${fixture_key}',
            repeat('a', 64), '{\"invoiceId\":\"ci-fixture\"}'::jsonb)
    RETURNING id
  ) SELECT id FROM inserted;")
if [[ ! "$created_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
  echo 'FAIL: first PostgreSQL session did not commit a valid job UUID' >&2
  exit 1
fi

# Session 2 is a new process/connection; it must observe committed data.
persisted=$(psql -X -v ON_ERROR_STOP=1 -At -c "
  SELECT count(*) FROM erp_operation_jobs
  WHERE id = '${created_id}'::uuid AND tenant_id = '${fixture_tenant}'
    AND actor_id = 'ci-actor' AND operation = 'invoice_delivery'
    AND idempotency_key = '${fixture_key}' AND status = 'queued'
    AND payload_sha256 = repeat('a', 64)
    AND payload = '{\"invoiceId\":\"ci-fixture\"}'::jsonb;")
if [[ "$persisted" != '1' ]]; then
  echo 'FAIL: committed ERP reservation disappeared or changed across connections' >&2
  exit 1
fi

# Session 3 replays the same reservation: no duplicate durable job is created.
replayed=$(psql -X -v ON_ERROR_STOP=1 -At -c "
  WITH attempted AS (
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('${fixture_tenant}', 'ci-actor', 'invoice_delivery', '${fixture_key}',
            repeat('a', 64), '{\"invoiceId\":\"ci-fixture\"}'::jsonb)
    ON CONFLICT (tenant_id, operation, idempotency_key) DO NOTHING
    RETURNING id
  ) SELECT count(*) FROM attempted;")
if [[ "$replayed" != '0' ]]; then
  echo 'FAIL: replay inserted a duplicate ERP reservation' >&2
  exit 1
fi

# Session 4 commits a valid worker claim, without dispatching anything.
claimed=$(psql -X -v ON_ERROR_STOP=1 -At -c "
  WITH claimed AS (
    UPDATE erp_operation_jobs SET
      status = 'processing', claimed_by = 'ci-worker',
      claimed_at = '2026-11-01T12:00:00Z',
      lease_expires_at = '2026-11-01T12:05:00Z'
    WHERE id = '${created_id}'::uuid AND tenant_id = '${fixture_tenant}'
      AND status = 'queued' AND dispatch_started_at IS NULL
    RETURNING id
  ) SELECT count(*) FROM claimed;")
if [[ "$claimed" != '1' ]]; then
  echo 'FAIL: PostgreSQL did not commit the valid worker claim' >&2
  exit 1
fi

# Session 5 verifies the claimed state was not held in process memory.
retained=$(psql -X -v ON_ERROR_STOP=1 -At -c "
  SELECT count(*) FROM erp_operation_jobs
  WHERE id = '${created_id}'::uuid AND tenant_id = '${fixture_tenant}'
    AND status = 'processing' AND claimed_by = 'ci-worker'
    AND claimed_at = '2026-11-01T12:00:00Z'::timestamptz
    AND lease_expires_at = '2026-11-01T12:05:00Z'::timestamptz
    AND dispatch_started_at IS NULL AND failure_code IS NULL;")
if [[ "$retained" != '1' ]]; then
  echo 'FAIL: committed ERP worker claim was not retained across connections' >&2
  exit 1
fi

echo 'PASS: PostgreSQL committed reservation, idempotent replay, and worker claim persist across five independent client sessions.'
