-- Apply only through the versioned migration runner, after backup verification.
-- Owner-level billing data: never place private member workspace documents here.
CREATE TABLE IF NOT EXISTS membership_subscriptions (
 id TEXT PRIMARY KEY, member_entity_id TEXT NOT NULL, owner_entity_id TEXT NOT NULL,
 plan_id TEXT NOT NULL, amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
 currency CHAR(3) NOT NULL DEFAULT 'USD',
 billing_day SMALLINT NOT NULL CHECK(billing_day BETWEEN 1 AND 31),
 status TEXT NOT NULL CHECK(status IN ('active','paused','cancelled')),
 ach_mandate_reference TEXT, ach_payment_method_ref TEXT,
 ach_authorized_at TIMESTAMPTZ, ach_revoked_at TIMESTAMPTZ,
 ach_max_amount_cents BIGINT, next_due_date DATE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (member_entity_id <> owner_entity_id)
);
CREATE TABLE IF NOT EXISTS membership_invoices (
 id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL REFERENCES membership_subscriptions(id),
 due_date DATE NOT NULL, period_month CHAR(7) NOT NULL,
 amount_cents BIGINT NOT NULL CHECK(amount_cents>=0),
 currency CHAR(3) NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('due','covered_by_credit','pending','settled','failed','returned','cancelled')),
 document_drive_file_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(subscription_id,period_month)
);
CREATE TABLE IF NOT EXISTS membership_journal_entries (
 id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES membership_invoices(id),
 entity_id TEXT NOT NULL, account TEXT NOT NULL,
 debit_cents BIGINT NOT NULL DEFAULT 0 CHECK(debit_cents>=0),
 credit_cents BIGINT NOT NULL DEFAULT 0 CHECK(credit_cents>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK ((debit_cents=0 AND credit_cents>0) OR (credit_cents=0 AND debit_cents>0))
);
CREATE TABLE IF NOT EXISTS membership_payment_attempts (
 id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES membership_invoices(id),
 idempotency_key TEXT NOT NULL UNIQUE, provider TEXT NOT NULL,
 provider_transaction_id TEXT UNIQUE, status TEXT NOT NULL,
 error_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS membership_documents (
 id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL REFERENCES membership_subscriptions(id),
 invoice_id TEXT REFERENCES membership_invoices(id), document_type TEXT NOT NULL,
 drive_file_id TEXT NOT NULL, sha256 TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(subscription_id,document_type,version)
);
CREATE INDEX IF NOT EXISTS membership_invoices_due_idx ON membership_invoices(due_date,status);
