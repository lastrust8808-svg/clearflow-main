# Integration execution — registration and persistence first

Baseline: PR #28 head `83d3f54ce4b4b9b1ec4d32850c300014d97e79aa`. This is an isolated development branch, not a production deployment.

## First acceptance scenario (Fox regression)
1. Register synthetic user A through actual server authentication; verify durable user and tenant membership.
2. Create entity E as user A. Save and reload; verify persisted entity ID and ownership.
3. Sign out, revoke session, restart server, sign back in, and verify entity E is still present and editable.
4. Register user B; ensure B cannot read, list, update, or delete E, including forged tenant IDs.
5. Validate authorization for business/trust workspace switching and membership agreements.
6. Capture HTTP status codes, database row evidence, build SHA, browser screenshots, and CI job links.

## Integration sequence
- Security #23 and release hardening #16: authenticate server-side; enforce ownership and durable storage.
- Membership #26: connect real registration, membership mapping, and entity navigation. Do not grant access on client-only flags.
- ERP #25: fail closed on unconfirmed delivery and posting.
- Banking #24: retain deduplication, tenant scope, and authorization; disable transfers pending provider proof.
- Trusts #27: enforce document scope and durable reference provenance.
- Resolve Plaid #19 and UI #18 build integration without replacing existing dashboard.

## Gates
- Run `npm ci`, `npm run build`, `npm run lint`, unit/integration suites, and security audit against the integrated head.
- Validate migrations and backup/restore on isolated PostgreSQL; stage-only end-to-end authentication and tenant isolation.
- Require real browser evidence for registration, refresh, logout/login, and mobile navigation.
- Require signed webhook and provider sandbox evidence before billing or banking operations.
- No merges to main, Render deployment, database writes to production, or live payments.
