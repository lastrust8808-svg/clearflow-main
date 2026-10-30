-- Proposed ERP job persistence schema. NOT applied to any environment by this PR.
-- Apply only through the versioned migration/restore gate after Security review.
CREATE TABLE IF NOT EXISTS erp_operation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  actor_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN (
    'invoice_delivery', 'invoice_export', 'statement_import', 'reconciliation_close'
  )),
  idempotency_key text NOT NULL,
  payload_sha256 char(64) NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'processed', 'sent', 'failed')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  failure_code text CHECK (failure_code IS NULL OR failure_code IN (
    'ERP_WORKER_ERROR', 'ERP_PROVIDER_REJECTED',
    'ERP_VALIDATION_REJECTED', 'ERP_RETRY_EXHAUSTED'
  )),
  claimed_by text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
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
-- Lease expiry recovery, successful worker completion, delivery receipts and audit trail
-- remain separate gates. This file is NOT an applied migration.
