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
  UNIQUE (tenant_id, operation, idempotency_key)
);
CREATE INDEX IF NOT EXISTS erp_operation_jobs_tenant_status_idx
  ON erp_operation_jobs (tenant_id, status, created_at);
-- No public read/write grants. The API must authenticate and authorize the
-- tenant, actor, entity and invoice/reconciliation before invoking the store.
-- Worker claiming, delivery receipts and audit trail are separate gates.
