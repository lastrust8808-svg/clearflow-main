# Clear.Flow private-release integration gate

This branch targets the existing Render `clearflow-api` service **only after explicit deployment approval**. It is based on `feature/odoo-dashboard-release-integration-2026-10-26`, which already incorporates release hardening as its ancestry. It must not be deployed directly or merged while draft.

## Integration order and acceptance

1. **UI baseline** — retain Odoo-style dashboard PR #18 and its release-hardening parent PR #16; verify `OverviewPage`, navigation, production build and mobile viewport. Do not introduce a second UI path.
2. **Security PR #23** — reconcile tenant/auth guards against the release-hardening storage and auth changes. Require authenticated cross-tenant rejection and durable persistence proof.
3. **ERP PR #25** — integrate fail-closed delivery/payment routes. Queued delivery must not be represented as sent. Verify durable delivery receipts.
4. **Membership PR #26** — reconcile entitlements and webhook contracts with server auth; signed events, replay/idempotency and persistence must pass.
5. **Banking PR #24** — retain reconciliation identity/amount validation, and require server-side transaction authorization, idempotency and persistent audit before transfers are enabled.
6. **Trusts PR #27** — integrate document/reference validation with durable tenant-bound records; do not present reference checks as cryptographic verification.
7. **Plaid PRs #15/#19** — resolve TypeScript compile issues and prove non-mock provider connection flows before enabling them.

## Release gates

- [ ] `npm ci`, production build, TypeScript checks, security audit and full CI pass on **this integrated head**
- [ ] Authenticated tenant isolation, database migration and rollback/restore proven against intended runtime
- [ ] Mobile login, dashboard navigation, create/edit/save/refresh/logout tested on real browser
- [ ] ERP/B2B durable delivery and approvals verified without false-success responses
- [ ] Membership signed webhook + idempotent billing event persistence verified with test data
- [ ] Banking provider test integration, reconciliation, idempotency and transfer controls verified
- [ ] Production configuration reviewed for secrets, external registrations, backups, and rollback
- [ ] Owner approves a controlled private deployment to existing Render service
- [ ] Real transfers remain disabled until separate explicit approval after end-to-end verification

No production credentials, database writes, deployments, payments, or public registration changes are authorized by this document.
