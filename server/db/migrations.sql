-- server/db/migrations.sql
-- Schema definitions for the Clear-Flow application database (PostgreSQL).

-- Represents an end-user of the Clear-Flow application.
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Represents a Plaid Item: a connection to a financial institution for a user.
CREATE TABLE plaid_items (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plaid_item_id VARCHAR(255) UNIQUE NOT NULL,
    access_token_encrypted TEXT NOT NULL, -- Stores the encrypted Plaid access_token
    institution_id VARCHAR(255),
    institution_name VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    cursor TEXT, -- For transaction sync
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_plaid_items_user_id ON plaid_items(user_id);

-- Represents a single bank account associated with a Plaid Item.
CREATE TABLE plaid_accounts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plaid_item_id VARCHAR(255) NOT NULL REFERENCES plaid_items(plaid_item_id) ON DELETE CASCADE,
    plaid_account_id VARCHAR(255) UNIQUE NOT NULL,
    mask VARCHAR(10),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    subtype VARCHAR(100),
    persistent_account_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_plaid_accounts_plaid_item_id ON plaid_accounts(plaid_item_id);

-- Stores identity information (owner names, addresses, etc.) for an account.
CREATE TABLE identities (
    id UUID PRIMARY KEY,
    plaid_account_id VARCHAR(255) NOT NULL REFERENCES plaid_accounts(plaid_account_id) ON DELETE CASCADE,
    legal_name VARCHAR(255),
    addresses JSONB,
    phones JSONB,
    emails JSONB,
    source VARCHAR(50) NOT NULL DEFAULT 'plaid',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(plaid_account_id, source) -- Ensure only one identity record per account from a given source.
);

-- A reference table for routing numbers and their supported payment rails.
-- This would be populated from FRB E-Payments directories.
CREATE TABLE rails_directory (
    routing_number VARCHAR(9) PRIMARY KEY,
    institution_name VARCHAR(255),
    supports_fedach BOOLEAN NOT NULL DEFAULT FALSE,
    supports_fedwire BOOLEAN NOT NULL DEFAULT FALSE,
    supports_fednow BOOLEAN NOT NULL DEFAULT FALSE,
    supports_rtp BOOLEAN NOT NULL DEFAULT FALSE,
    last_refreshed_at TIMESTAMPTZ NOT NULL
);

-- Logs every Plaid Signal evaluation for audit and reporting.
CREATE TABLE ach_risk_evaluations (
    id UUID PRIMARY KEY,
    plaid_account_id VARCHAR(255) NOT NULL REFERENCES plaid_accounts(plaid_account_id),
    client_transaction_id VARCHAR(255) UNIQUE NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    evaluate_request JSONB,
    evaluate_response JSONB,
    decision_reported BOOLEAN NOT NULL DEFAULT FALSE,
    return_reported BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ach_risk_evaluations_account_id ON ach_risk_evaluations(plaid_account_id);


-- === GCP-Style Billing System Schema ===

-- Represents a user-created entity, which acts as a cost center (like a GCP Project).
CREATE TABLE entities (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL, -- LLC, Personal, etc.
    labels JSONB, -- For cost allocation, e.g., {"env": "production"}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_entities_user_id ON entities(user_id);

-- Represents a periodic invoice for a user (the payer).
CREATE TABLE invoices (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'draft', 'open', 'paid', 'void'
    subtotal NUMERIC(15, 2) NOT NULL,
    credits NUMERIC(15, 2) NOT NULL,
    total NUMERIC(15, 2) NOT NULL,
    amount_paid NUMERIC(15, 2) NOT NULL DEFAULT 0,
    balance_due NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- Represents an immutable, append-only ledger of rated charges (the accounting event).
-- This is the core of the billing system.
CREATE TABLE rated_charges (
    id UUID PRIMARY KEY,
    entity_id UUID NOT NULL REFERENCES entities(id),
    invoice_id UUID REFERENCES invoices(id), -- Nullable until invoiced
    timestamp TIMESTAMPTZ NOT NULL, -- Time of the usage event
    description TEXT NOT NULL,
    service_id VARCHAR(100) NOT NULL, -- e.g., 'gemini-api'
    sku_id VARCHAR(100) NOT NULL, -- e.g., 'document-analysis'
    usage_quantity NUMERIC(18, 6) NOT NULL,
    usage_unit VARCHAR(50) NOT NULL,
    list_price NUMERIC(15, 6) NOT NULL,
    negotiated_price NUMERIC(15, 6) NOT NULL,
    cost NUMERIC(15, 4) NOT NULL,
    credit_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
    final_cost NUMERIC(15, 4) NOT NULL,
    is_billed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rated_charges_entity_id ON rated_charges(entity_id);
CREATE INDEX idx_rated_charges_invoice_id ON rated_charges(invoice_id);
CREATE INDEX idx_rated_charges_timestamp ON rated_charges(timestamp);

-- Represents a payment/settlement applied to an invoice.
CREATE TABLE settlements (
    id UUID PRIMARY KEY,
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    payment_date DATE NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    method VARCHAR(50) NOT NULL, -- 'ACH', 'Wire', 'Internal'
    confirmation_code VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_settlements_invoice_id ON settlements(invoice_id);