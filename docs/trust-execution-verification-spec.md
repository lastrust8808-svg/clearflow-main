# Trust execution verification and restrictions (product specification)

Status: proposed; not deployed. Applies to trust entities and wet-ink signing workflow. Implementation must be reviewed for applicable jurisdiction and legal execution requirements.

## Start and reminders
- At final unsigned document delivery, persist delivered_at (UTC), signing_method, document_version_id, required_signers, applicable jurisdiction, and due_at = delivered_at + 30 calendar days. Preserve immutable delivery evidence. Do not start the clock at draft approval.
- Show persistent trust dashboard banner with required signature pages, upload action, execution status, days remaining, and reason for any restrictions.
- Send configurable dashboard/email reminders on days 7, 14, 21, 27, and overdue at day 30, idempotently and respecting notification preferences. Reminders must never imply the unsigned trust is legally effective.
- Accept signed full document and signature/notary pages; preserve approved unsigned original and each upload as immutable, versioned, hash-identified records with actor, time, source and audit history.
- Verify signatures of required parties, document completeness, version match, applicable witnesses/notarization, and other jurisdiction-specific execution requirements. Flag discrepancies for manual review. Upload != legal verification.
- Store status: unsigned_pending, uploaded_pending_review, changes_required, verified_executed, overdue_restricted, and exception_review. An authorized reviewer must record evidence and verification decision. Do not claim Clear.Flow itself provides legal advice.

## Transaction enforcement
- From initial unsigned delivery until verified_executed, block trust-scoped actions that rely on the trust's legal authority: outgoing transfers, asset dispositions, contract execution, distributions, borrowing/pledging and other irreversible financial operations. Day 30 changes the overdue status and escalates reminders; it does NOT start the restriction.
- Apply authorization server-side at every transaction/execution endpoint and asynchronous worker, not merely UI. Default deny on missing/ambiguous verification; require correct entity membership and permission checks. Do not rely on a user-controlled status flag.
- Permit read-only documents, upload/resubmit, audit history, customer support, and authorized verification review while restricted. Avoid restricting other independently verified business entities.
- Release restrictions only after verified_executed status is recorded by authorized review. Log all status transitions and denied actions. Include a controlled exception process for legally required preservation/emergency actions, never an undocumented override.

## Physical binder and QR
- Binder QR resolves to non-sensitive verification landing page. Protected digital trust portfolio and signed documents require authorization. QR must not embed secrets or expose asset/beneficiary/ledger information publicly.
- Show current verified executed document, retain historical versions. If unsigned, clearly label as unsigned. Printing/shipping is independent of legal execution status.
- Do not automatically post scheduled assets as verified reserves without source, ownership/funding evidence and valuation review.

## Acceptance tests
1. Pending unsigned trust cannot transact on day 0 or day 29.
2. On day 30, overdue flag/reminder appears, no additional unrelated access is blocked.
3. Upload alone does not unlock transaction execution.
4. Approved reviewer verifies complete legal execution -> trust transaction gate unlocks; audit trail preserved.
5. Wrong entity, expired QR, unauthenticated visitor and forged client status cannot bypass gates.
6. Duplicate reminders, uploads, webhook events and review requests are idempotent.
7. A separate verified business entity remains operational.
