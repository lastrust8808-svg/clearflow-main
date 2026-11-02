#!/usr/bin/env bash
# Disposable GitHub Actions PostgreSQL 16 acceptance: a committed ERP job and
# its exclusive worker lease must survive an actual database-server restart.
# Never run against staging/production; no worker, SMTP or payment is invoked.
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != 'true' || "${CI:-}" != 'true' ||
      "${PGHOST:-}" != 'localhost' || "${PGDATABASE:-}" != 'erp_test' ||
      "${PGUSER:-}" != 'erp_test' ]]; then
  echo 'FAIL: server restart test is restricted to disposable GitHub Actions ERP database' >&2
  exit 1
fi

tenant='ci-postmaster-restart-tenant'
key='ci-postmaster-restart-fixture'
cleanup() {
  psql -X -v ON_ERROR_STOP=1 -q -c "DELETE FROM erp_operation_jobs
    WHERE tenant_id = '$tenant' AND idempotency_key = '$key'" >/dev/null || true
}
trap cleanup EXIT

created_id=$(psql -X -v ON_ERROR_STOP=1 -At -c "
  WITH inserted AS (
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('$tenant', 'ci-actor', 'invoice_delivery', '$key',
            repeat('c', 64), '{\"invoiceId\":\"ci-restart-fixture\"}'::jsonb)
    RETURNING id
  ) SELECT id FROM inserted;")
if [[ ! "$created_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
  echo 'FAIL: fixture reservation did not commit a valid job UUID' >&2
  exit 1
fi

claimed=$(psql -X -v ON_ERROR_STOP=1 -At -c "
  WITH claimed AS (
    UPDATE erp_operation_jobs
    SET status = 'processing', claimed_by = 'ci-restart-worker',
        claimed_at = now(), lease_expires_at = now() + interval '10 minutes',
        updated_at = now()
    WHERE id = '$created_id'::uuid AND tenant_id = '$tenant'
      AND status = 'queued' AND dispatch_started_at IS NULL
      AND failure_code IS NULL AND claimed_by IS NULL
      AND claimed_at IS NULL AND lease_expires_at IS NULL
    RETURNING id
  ) SELECT count(*) FROM claimed;")
if [[ "$claimed" != '1' ]]; then
  echo 'FAIL: worker lease was not committed before restart' >&2
  exit 1
fi
before=$(psql -X -v ON_ERROR_STOP=1 -At -c "SELECT pg_postmaster_start_time();")

# GitHub Actions starts this one isolated postgres:16 service container.
# Fail closed if another container or unexpected service configuration exists.
mapfile -t containers < <(docker ps --filter ancestor=postgres:16 --format '{{.ID}}')
if [[ "${#containers[@]}" != 1 ]]; then
  echo 'FAIL: expected exactly one disposable postgres:16 service container' >&2
  exit 1
fi
container="${containers[0]}"
image=$(docker inspect --format '{{.Config.Image}}' "$container")
envs=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container")
if [[ "$image" != 'postgres:16' ]] ||
   ! grep -qx 'POSTGRES_DB=erp_test' <<<"$envs" ||
   ! grep -qx 'POSTGRES_USER=erp_test' <<<"$envs"; then
  echo 'FAIL: refusing to restart a database without verified CI fixture identity' >&2
  exit 1
fi

docker restart --time 5 "$container" >/dev/null
ready=false
for attempt in {1..60}; do
  if pg_isready -q -h "$PGHOST" -p "${PGPORT:-5432}" -U "$PGUSER" -d "$PGDATABASE"; then
    ready=true
    break
  fi
  sleep 0.5
done
if [[ "$ready" != true ]]; then
  echo 'FAIL: disposable PostgreSQL did not become ready after restart' >&2
  exit 1
fi
after=$(psql -X -v ON_ERROR_STOP=1 -At -c "SELECT pg_postmaster_start_time();")
if [[ "$before" == "$after" ]]; then
  echo 'FAIL: PostgreSQL server start time did not change' >&2
  exit 1
fi

retained=$(psql -X -v ON_ERROR_STOP=1 -At -c "
  SELECT count(*) FROM erp_operation_jobs
  WHERE id = '$created_id'::uuid AND tenant_id = '$tenant'
    AND actor_id = 'ci-actor' AND operation = 'invoice_delivery'
    AND idempotency_key = '$key' AND payload_sha256 = repeat('c', 64)
    AND payload = '{\"invoiceId\":\"ci-restart-fixture\"}'::jsonb
    AND status = 'processing' AND claimed_by = 'ci-restart-worker'
    AND claimed_at IS NOT NULL AND lease_expires_at > claimed_at
    AND dispatch_started_at IS NULL AND failure_code IS NULL;")
if [[ "$retained" != '1' ]]; then
  echo 'FAIL: committed job or worker lease was lost/altered after server restart' >&2
  exit 1
fi

replayed=$(psql -X -v ON_ERROR_STOP=1 -At -c "
  WITH attempted AS (
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('$tenant', 'ci-actor', 'invoice_delivery', '$key',
            repeat('c', 64), '{\"invoiceId\":\"ci-restart-fixture\"}'::jsonb)
    ON CONFLICT (tenant_id, operation, idempotency_key) DO NOTHING
    RETURNING id
  ) SELECT count(*) FROM attempted;")
if [[ "$replayed" != '0' ]]; then
  echo 'FAIL: restart permitted a duplicate idempotent ERP reservation' >&2
  exit 1
fi

echo 'PASS: disposable PostgreSQL postmaster restarted; committed job, lease, and idempotency fence survived.'
