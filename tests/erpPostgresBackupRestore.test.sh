#!/usr/bin/env bash
# Disposable GitHub Actions PostgreSQL backup/restore acceptance for ERP jobs.
# No staging/production database, provider, email, payment or worker is touched.
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != 'true' || "${CI:-}" != 'true' ||
      "${PGHOST:-}" != 'localhost' || "${PGPORT:-}" != '5432' ||
      "${PGUSER:-}" != 'erp_test' || "${PGDATABASE:-}" != 'erp_test' ]]; then
  echo 'FAIL: ERP restore acceptance is restricted to the disposable CI database' >&2
  exit 1
fi

# Require the exact ephemeral PostgreSQL service from this workflow, not just
# environment variables which could accidentally point at a persistent host.
mapfile -t containers < <(docker ps --filter ancestor=postgres:16 --format '{{.ID}}')
if [[ "${#containers[@]}" != 1 ]]; then
  echo 'FAIL: expected exactly one disposable postgres:16 service' >&2
  exit 1
fi
image=$(docker inspect --format '{{.Config.Image}}' "${containers[0]}")
envs=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${containers[0]}")
if [[ "$image" != 'postgres:16' ]] ||
   ! grep -qx 'POSTGRES_DB=erp_test' <<<"$envs" ||
   ! grep -qx 'POSTGRES_USER=erp_test' <<<"$envs"; then
  echo 'FAIL: PostgreSQL service identity is not the CI fixture' >&2
  exit 1
fi

tenant='ci-restore-only-tenant'
restore_db='erp_restore_acceptance'
restore_created=false
tmpdir=$(mktemp -d)
cleanup() {
  if [[ "$restore_created" == true ]]; then
    dropdb --if-exists "$restore_db" >/dev/null 2>&1 || true
  fi
  psql -X -v ON_ERROR_STOP=1 -q -c \
    "DELETE FROM erp_operation_jobs WHERE tenant_id = '$tenant'" >/dev/null 2>&1 || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT

# Persist three different recovery states in the source database. In
# particular, an ambiguous external dispatch must NOT become queued on restore.
psql -X -v ON_ERROR_STOP=1 -q <<SQL
INSERT INTO erp_operation_jobs
  (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload,
   status, claimed_by, claimed_at, lease_expires_at)
VALUES
  ('$tenant', 'ci-actor', 'invoice_delivery', 'ci-restore-processing',
   repeat('a', 64), '{"invoiceId":"restore-processing"}'::jsonb,
   'processing', 'ci-worker', '2026-11-01T12:00:00Z', '2026-11-01T12:05:00Z');
INSERT INTO erp_operation_jobs
  (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload,
   status, dispatch_started_at)
VALUES
  ('$tenant', 'ci-actor', 'invoice_delivery', 'ci-restore-unknown',
   repeat('b', 64), '{"invoiceId":"restore-unknown"}'::jsonb,
   'outcome_unknown', '2026-11-01T12:01:00Z');
INSERT INTO erp_operation_jobs
  (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
VALUES
  ('$tenant', 'ci-actor', 'invoice_export', 'ci-restore-queued',
   repeat('c', 64), '{"invoiceId":"restore-queued"}'::jsonb);
SQL

# A complete table dump includes constraints and indexes, not merely JSON rows.
# Restore into a NEW disposable database; never overwrite the source.
source_count=$(psql -X -v ON_ERROR_STOP=1 -At -c \
  "SELECT count(*) FROM erp_operation_jobs WHERE tenant_id = '$tenant'")
if [[ "$source_count" != '3' ]]; then
  echo 'FAIL: source fixture is not exactly three durable jobs' >&2
  exit 1
fi
pg_dump --format=custom --table=public.erp_operation_jobs --file="$tmpdir/jobs.dump"
createdb "$restore_db"
restore_created=true
pg_restore --exit-on-error --no-owner --no-acl --dbname="$restore_db" "$tmpdir/jobs.dump"

# Compare every persisted fixture column, including UUIDs, timestamps,
# dispatch fences, failure reasons and JSON, across independent databases.
fingerprint_sql="SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id))
 FROM (SELECT id::text, tenant_id, actor_id, operation, idempotency_key,
              payload_sha256, payload, status, created_at, updated_at,
              failure_code, claimed_by, claimed_at, lease_expires_at,
              dispatch_started_at
       FROM erp_operation_jobs WHERE tenant_id = '$tenant') AS x"
source_hash=$(psql -X -v ON_ERROR_STOP=1 -At -c "$fingerprint_sql")
restored_hash=$(psql -X -v ON_ERROR_STOP=1 -At -d "$restore_db" -c "$fingerprint_sql")
if [[ -z "$source_hash" || "$source_hash" != "$restored_hash" ]]; then
  echo 'FAIL: ERP recovery state differs after database backup/restore' >&2
  exit 1
fi

# The restored database must still enforce idempotency and forbid fabricated
# delivery success or automatic retry of an ambiguous dispatch.
psql -X -v ON_ERROR_STOP=1 -q -d "$restore_db" <<SQL
DO \$verify\$
BEGIN
  IF (SELECT count(*) FROM erp_operation_jobs
      WHERE tenant_id = '$tenant') <> 3 THEN
    RAISE EXCEPTION 'restored ERP job count differs';
  END IF;
  IF (SELECT count(*) FROM erp_operation_jobs
      WHERE tenant_id = '$tenant' AND status = 'processing'
        AND claimed_by = 'ci-worker' AND lease_expires_at > claimed_at) <> 1 THEN
    RAISE EXCEPTION 'restored worker lease missing';
  END IF;
  IF (SELECT count(*) FROM erp_operation_jobs
      WHERE tenant_id = '$tenant' AND status = 'outcome_unknown'
        AND dispatch_started_at IS NOT NULL AND claimed_by IS NULL) <> 1 THEN
    RAISE EXCEPTION 'ambiguous dispatch was lost or requeued on restore';
  END IF;
  BEGIN
    INSERT INTO erp_operation_jobs
      (tenant_id, actor_id, operation, idempotency_key, payload_sha256, payload)
    VALUES ('$tenant', 'ci-actor', 'invoice_delivery', 'ci-restore-unknown',
            repeat('b', 64), '{}'::jsonb);
    RAISE EXCEPTION 'restored idempotency constraint is missing';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE erp_operation_jobs SET status = 'sent'
    WHERE tenant_id = '$tenant' AND idempotency_key = 'ci-restore-queued';
    RAISE EXCEPTION 'restored database allowed evidence-free sent status';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE erp_operation_jobs SET status = 'queued'
    WHERE tenant_id = '$tenant' AND idempotency_key = 'ci-restore-unknown';
    RAISE EXCEPTION 'restored database allowed ambiguous dispatch retry';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
\$verify\$;
SQL

echo 'PASS: disposable PostgreSQL dump/restore retained three job states, leases, dispatch fences and idempotency constraints.'
