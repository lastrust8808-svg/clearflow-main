# Trusts, Reserves & Documents — integration contract (draft)

Status: draft, non-production domain-policy implementation with automated invariant tests. The policy modules are not authenticated, durable application integrations; no production release or end-to-end verification is claimed.

## Verified evidence and release boundary (2026-11-21)
- Draft PR #27 HEAD `0fbf8df41c92cf6d79e979c51e59121a9c394c97`: GitHub Actions run `44866732968` reports completed/success for the Trust reserves and note invariants workflow. This is CI evidence only, not a staging or live-integration result.
- Domain policy implementations exist for reserve journal/capacity, private-note lifecycle/amortization, enforcement notice evaluation, document versions, QR origin/registry policy, and trustee/signing evidence. Passing unit checks do not establish durable records, authenticated legal authority, valid signatures, actual service, enforceability or settled funds.
- **Unverified acceptance gates:** authenticated tenant/entity/trustee authorization; persistent tenant-isolated storage and restart/restore tests; externally evidenced signer consent/provenance; HTTPS QR endpoint with actual generated PDF hash verification; end-to-end revocation/privacy tests; audited enforcement delivery and human review. None is waived by this CI run.
- Cross-workstream coordination: Security PR #23 and Integration PR #29 both change account storage/path utilities; Authentication PR #32 changes session and identity handling. Do not integrate or duplicate these changes on this branch until their contracts and conflicts are resolved.


## Ownership and isolation
- Own trust administration, trustee authority, beneficiaries, asset ownership, reserve ledgers, private notes, document generation, QR verification, signatures, presentment/default workflows.
- Do not change authentication, tenant storage, banking feeds, ERP posting, payment execution or production configuration in this workstream.
- All mutable records require authenticated tenant/entity authorization from the Security workstream; deny cross-tenant access, including by document identifier.
- Changes to a trustee or asset owner must be versioned and audited, not silently overwrite prior legal records.

## Domain invariants
1. Each trust has stable IDs, governing jurisdiction, effective date, versioned trust instruments, trustee appointment/acceptance/revocation, beneficiary interests, and independent/joint signing rules.
2. Assets have distinct legal owner, custodian, valuation source/date, encumbrances, and evidence references. Transfers require immutable journal events; valuation changes do not create cash.
3. Reserves distinguish cash, noncash collateral, restricted/pledged assets, and available capacity. Every reserve entry requires a canonical `assetId` and a distinct `evidenceRef`; reuse of either the underlying asset ID or the evidence reference across entry IDs or asset kinds is rejected before classification. The caller must verify that `assetId` represents the same underlying asset across evidence records and that references resolve to authentic, current records. Neither identifier validation nor distinct references establish independently available cash. Never imply a private promissory note is bank cash, settled credit, or spendable funds.
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
