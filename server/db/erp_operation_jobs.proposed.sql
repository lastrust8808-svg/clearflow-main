-- Proposed ERP job persistence schema. NOT applied to any environment by this PR.
-- Fail closed: 'sent'/'processed' are prohibited until a separate reviewed
-- migration introduces durable, operation-bound completion evidence and audit.
-- Apply only through the versioned migration/restore gate after Security review.
CREATE TABLE IF NOT EXISTS erp_operation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Mirror the service's basic identifier bounds at the persistence layer:
  -- no empty, overlong, boundary-whitespace or control-bearing identities.
  -- Full Unicode NFC/format-control validation remains in the service.
  tenant_id text NOT NULL CONSTRAINT erp_tenant_identity_format CHECK (
    char_length(tenant_id) BETWEEN 1 AND 255
    AND tenant_id !~ '[[:cntrl:]]'
    AND tenant_id ~ '^[^[:space:]](.*[^[:space:]])?$'
  ),
  actor_id text NOT NULL CONSTRAINT erp_actor_identity_format CHECK (
    char_length(actor_id) BETWEEN 1 AND 255
    AND actor_id !~ '[[:cntrl:]]'
    AND actor_id ~ '^[^[:space:]](.*[^[:space:]])?$'
  ),
  operation text NOT NULL CHECK (operation IN (
    'invoice_delivery', 'invoice_export', 'statement_import', 'reconciliation_close'
  )),
  -- Keep the database idempotency contract aligned with reserveErpOperationJob.
  idempotency_key text NOT NULL CONSTRAINT erp_idempotency_key_format CHECK (
    idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$'
  ),
  -- The reservation digest is always lowercase SHA-256 hex. Reject malformed
  -- database rows before they can be mistaken for an idempotent acceptance.
  payload_sha256 char(64) NOT NULL CONSTRAINT erp_payload_digest_format
    CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'failed', 'outcome_unknown')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  failure_code text CHECK (failure_code IS NULL OR failure_code IN (
    'ERP_WORKER_ERROR', 'ERP_PROVIDER_REJECTED',
    'ERP_VALIDATION_REJECTED', 'ERP_RETRY_EXHAUSTED'
  )),
  -- Persist only canonical worker audit identities, including when a future
  -- caller bypasses the worker service. NULL remains valid before claiming.
  claimed_by text CONSTRAINT erp_worker_identity_format CHECK (
    claimed_by IS NULL OR (
      char_length(claimed_by) BETWEEN 1 AND 255
      AND claimed_by !~ '[[:cntrl:]]'
      AND claimed_by ~ '^[^[:space:]](.*[^[:space:]])?  claimed_at timestamptz,
  lease_expires_at timestamptz,
  dispatch_started_at timestamptz,
  CONSTRAINT erp_dispatch_fence_consistency CHECK (
    dispatch_started_at IS NULL OR status IN ('processing', 'outcome_unknown')
  ),
  -- A processing worker must not acquire a pre-dispatch fence before its
  -- claim or after its lease expires. Once quarantined as outcome_unknown,
  -- the lease is deliberately cleared but the original fence is retained.
  -- Keep timestamps monotonic even for direct SQL writes bypassing the API.
  CONSTRAINT erp_job_time_ordering CHECK (
    updated_at >= created_at
    AND (status <> 'processing' OR dispatch_started_at IS NULL OR
         (dispatch_started_at >= claimed_at AND
          dispatch_started_at < lease_expires_at))
  ),
  CONSTRAINT erp_failure_reason_consistency CHECK (
    (status = 'failed' AND failure_code IS NOT NULL)
    OR (status <> 'failed' AND failure_code IS NULL)
  ),
  CONSTRAINT erp_worker_claim_consistency CHECK (
    (status = 'processing' AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL
     AND lease_expires_at IS NOT NULL AND lease_expires_at > claimed_at)
    OR (status <> 'processing' AND claimed_by IS NULL AND claimed_at IS NULL
        AND lease_expires_at IS NULL)
  ),
  UNIQUE (tenant_id, operation, idempotency_key)
);
CREATE INDEX IF NOT EXISTS erp_operation_jobs_queued_claim_idx
  ON erp_operation_jobs (tenant_id, operation, created_at, id)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS erp_operation_jobs_tenant_status_idx
  ON erp_operation_jobs (tenant_id, status, created_at);
-- No public read/write grants. The API must authenticate and authorize the
-- tenant, actor, entity and invoice/reconciliation before invoking the store.
-- Atomic queued-job claiming is proposed but not yet wired to a worker.
-- Expired worker leases can be quarantined as outcome_unknown, never automatically requeued.
-- Before an external side effect, the worker must persist dispatch_started_at.
-- After dispatch begins, a job cannot be marked failed; an expired lease is quarantined.
-- Successful worker completion, delivery receipts and audit trail remain separate gates.
-- This file is NOT an applied migration.

    )
  ),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  dispatch_started_at timestamptz,
  CONSTRAINT erp_dispatch_fence_consistency CHECK (
    dispatch_started_at IS NULL OR status IN ('processing', 'outcome_unknown')
  ),
  -- A processing worker must not acquire a pre-dispatch fence before its
  -- claim or after its lease expires. Once quarantined as outcome_unknown,
  -- the lease is deliberately cleared but the original fence is retained.
  -- Keep timestamps monotonic even for direct SQL writes bypassing the API.
  CONSTRAINT erp_job_time_ordering CHECK (
    updated_at >= created_at
    AND (status <> 'processing' OR dispatch_started_at IS NULL OR
         (dispatch_started_at >= claimed_at AND
          dispatch_started_at < lease_expires_at))
  ),
  CONSTRAINT erp_failure_reason_consistency CHECK (
    (status = 'failed' AND failure_code IS NOT NULL)
    OR (status <> 'failed' AND failure_code IS NULL)
  ),
  CONSTRAINT erp_worker_claim_consistency CHECK (
    (status = 'processing' AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL
     AND lease_expires_at IS NOT NULL AND lease_expires_at > claimed_at)
    OR (status <> 'processing' AND claimed_by IS NULL AND claimed_at IS NULL
        AND lease_expires_at IS NULL)
  ),
  UNIQUE (tenant_id, operation, idempotency_key)
);
CREATE INDEX IF NOT EXISTS erp_operation_jobs_queued_claim_idx
  ON erp_operation_jobs (tenant_id, operation, created_at, id)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS erp_operation_jobs_tenant_status_idx
  ON erp_operation_jobs (tenant_id, status, created_at);
-- No public read/write grants. The API must authenticate and authorize the
-- tenant, actor, entity and invoice/reconciliation before invoking the store.
-- Atomic queued-job claiming is proposed but not yet wired to a worker.
-- Expired worker leases can be quarantined as outcome_unknown, never automatically requeued.
-- Before an external side effect, the worker must persist dispatch_started_at.
-- After dispatch begins, a job cannot be marked failed; an expired lease is quarantined.
-- Successful worker completion, delivery receipts and audit trail remain separate gates.
-- This file is NOT an applied migration.
