# ERP & Business Operations workstream

Scope: estimates, invoices, bills, expenses, accounting, jobs, B2B delivery, and approvals. Branch-only changes; no production deployment or payment initiation.

## Verified code-inspection findings (not runtime verification)

- `src/services/erpOperations.service.ts` returns synthetic successful jobs after network/API failure for invoice delivery and export. This can falsely represent unaccepted work as queued.
- `server/routes/erp.js` holds delivery/export jobs in process-memory arrays; restarting the server loses these records.
- The internal-user delivery path marks a job queued but does not demonstrate recipient delivery or durable inbox persistence.
- The invoice email path can send SMTP messages when configured; future integration tests must stub outbound mail.

## Acceptance gates

1. Never report success on network failure; expose a typed failure and preserve retry intent.
2. Persist delivery requests and approval decisions with tenant/entity ownership and idempotency keys, subject to Security & Infrastructure authentication contract.
3. Require explicit approval for sending and retain an immutable audit trail of actor, action, timestamp, document version, and result.
4. Enforce valid estimate → invoice → payment-record transitions, bill/expense accounting invariants, and job attribution; prevent duplicate posting.
5. Verify cross-tenant access denial, duplicate submissions, restart durability, and B2B recipient authorization in automated tests.
6. No real SMTP, bank transfer, or payment initiation in test environments.

## Cross-workstream contracts

- Security & Infrastructure: authenticated tenant context, durable migrations, transaction boundaries, audit log, restore tests.
- Banking & Reconciliation: read-only payment status and matching references; no direct settlement execution from ERP approvals.
- Document workflows: stable invoice identifiers, versioned documents, and delivery receipt metadata.

This initial commit records inspection findings and gates; it does **not** claim functionality is implemented or tested.
