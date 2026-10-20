# Clear.Flow production security and paid onboarding rollout

## Blockers before deployment
1. Require authenticated server-verified sessions on all account storage and vault routes. Match verified subject to requested account ID; allow audited administrator exceptions only. Deny access by default. Never trust client user IDs or Origin headers as authentication.
2. Replace browser-local credential accounts and browser-generated OTPs with server-side credential hashing, one-time server-generated challenges, expiry, throttling, and session revocation. Disable preview verification in production.
3. Secure the internal agreement-ledger write endpoint; reject unverified clients and user-supplied values. Verify payment events with provider signatures and idempotency keys.
4. Add tenant-scoped persisted account registry, append-only security audit events, consent/version evidence and role-scoped administration. No cross-customer financial-data access for onboarding specialists.
5. Review all integrations for authorization, webhook signatures, secrets, request-size limits, rate limiting, CSRF protection, encryption, backups and retention. Rotate exposed credentials if discovered.
6. Test owner and existing user migration before switching on fail-closed authentication; do not deploy a partial fix that locks users out.

## Approved pricing
Guided onboarding costs **$333 at signup**, split $300 for onboarding services and $33 for the first month of software access. After the included first month, software renews at **$33/month**, subject to express recurring-billing consent and cancellation rights. The first month starts when usable access begins, not at an arbitrary appointment date. Additional entity formation or trust services are quoted separately and exclude legal/tax advice.

## Signup and administration
Collect identity and contact information, individual/business/trust path, signed onboarding-services agreement, signed subscription agreement, terms version, timestamp, explicit recurring billing authorization and intake questionnaire. Collect payment using a PCI-compliant provider-hosted checkout; never store card numbers. Only verified payment webhook transitions status to paid. Allow customers to use the app after payment while guided appointment is pending. Assign customers round-robin between the owner and Jen subject to capacity and scheduling. Separate owner, onboarding specialist, and customer permissions. Show each specialist only their assigned clients and minimal intake data. Keep signed contracts, payments, status changes and assignment history auditable.

## Default policy requiring legal/privacy review
Month-to-month cancellable subscription; no 12-month receivable created. Failed payment => notify, grace period, suspend after disclosed deadline, permit export, then apply disclosed retention/deletion policy. Preserve legally required accounting/consent records separately. Do not claim the contracts are securities or pledgeable at face value.

## Verification
Add tests for unauthenticated reads/writes, cross-account access, forged roles, forged payment events, duplicate webhooks, cancellations, refunds, data export, session revocation, and owner-account migration. Perform staging end-to-end checkout tests before production rollout.
