# Trusts, Reserves & Documents — integration contract (draft)

Status: design and acceptance gates only. No runtime implementation or release verification is claimed.

## Ownership and isolation
- Own trust administration, trustee authority, beneficiaries, asset ownership, reserve ledgers, private notes, document generation, QR verification, signatures, presentment/default workflows.
- Do not change authentication, tenant storage, banking feeds, ERP posting, payment execution or production configuration in this workstream.
- All mutable records require authenticated tenant/entity authorization from the Security workstream; deny cross-tenant access, including by document identifier.
- Changes to a trustee or asset owner must be versioned and audited, not silently overwrite prior legal records.

## Domain invariants
1. Each trust has stable IDs, governing jurisdiction, effective date, versioned trust instruments, trustee appointment/acceptance/revocation, beneficiary interests, and independent/joint signing rules.
2. Assets have distinct legal owner, custodian, valuation source/date, encumbrances, and evidence references. Transfers require immutable journal events; valuation changes do not create cash.
3. Reserves distinguish cash, noncash collateral, restricted/pledged assets, and available capacity. Every reserve entry requires a distinct, canonical `evidenceRef`; exact evidence-reference replay across different entry IDs or asset kinds is rejected before classification. The caller must verify that references resolve to authentic, current, independently counted underlying assets; different references can still point to the same asset. Never imply a private promissory note is bank cash, settled credit, or spendable funds.
4. Notes track issuer, holder, principal, currency, rate convention, dates, schedule, security, status and signed documents. Posting requires actual confirmed events; no synthetic settlements.
5. Documents are immutable versions with opaque IDs and content hashes. A QR points to a controlled HTTPS verification endpoint, never embeds private data. Verification must distinguish valid, superseded, revoked and unknown; no public beneficiary/asset disclosure.
6. Signatures capture actor identity, role, consent, timestamp, evidence and document version. A drawn signature or uploaded image is not proof of legal execution or notarization.
7. Enforcement tracks dated presentment, service method/evidence, cure periods, dispute, notice, settlement and court actions. Generate drafts for human/legal review; never auto-send, auto-file or claim enforceability.

## Integration dependencies
- PR #21: reuse opaque IDs/hash primitives; needs durable verification registry, QR encoder and endpoint.
- PR #16 and Security branch: session authorization, durable tenant-scoped storage, migrations, backup/restore.
- ERP: explicit, idempotent journal posting interface; no direct mutation of invoices or banking transactions.
- Banking: verified settlement/reconciliation events only, no payment initiation.
- Documents: PDF renderer, secure storage, signature/notary provider and consent model.
- UI: entity-scoped Trust/Assets/Reserves/Notes/Documents/Enforcement routes.

## Acceptance evidence required before merge
- Unit tests: trust authority combinations, reserve invariants, note amortization and status transitions, immutable versions, revocation and tamper rejection.
- Integration tests: two tenants and multiple entities, reload/restart durability, concurrency conflicts, migration/restore, duplicate-event idempotency, authorization on QR verification.
- End-to-end: real PDF with QR resolves to correct record; modified PDF fails hash verification; signed and revoked documents show correct status; private fields never leak.
- CI: exact commit SHA, workflow URL and individual job outcomes. Staging evidence is distinct from CI. No release-ready assertion without both relevant evidence and security review.
