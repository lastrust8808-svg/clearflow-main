# Membership & UX workstream contract

Status: implementation branch; not release verified.

## Ownership
- Registration and onboarding journey
- Membership plans, subscription state, entitlement display
- Business/trust/holding entity workspace selection and dashboards
- Navigation and responsive/mobile usability

## Proposed plan configuration (requires product approval)
- Individual: $99 initial enrollment, $33/month
- Business establishment: $300 setup, $33/month
- Trust establishment and reserve: $500 setup, $55/month
- Multi-entity add-on: $22/month

Prices are configuration proposals, **not** active charges or verified processor products.

## Integration boundaries
- Security owns authenticated user and tenant identity; UI must not trust client-selected tenant IDs.
- Banking owns payment rails; subscription billing requires a separately approved payment processor, verified webhooks, idempotency, and server-side entitlement projection.
- Trust/Documents owns membership agreements, document identifiers, QR verification, and signature status.
- ERP owns invoices, bills, accounting and jobs; workspace navigation links to these modules without rewriting them.

## Acceptance gates
1. New account and returning account flows work on narrow mobile viewports.
2. Membership agreement persists server-side and can be retrieved after sign-out/sign-in.
3. Plan selection does not grant entitlements until verified billing confirmation.
4. Failed, duplicate, and out-of-order billing events do not double-charge or duplicate subscriptions.
5. Cross-tenant access attempts are denied server-side.
6. Entity switch preserves isolation and exposes only authorized workspaces.
7. Signature reminders and restrictions follow documented rules and server state.
8. CI build, typecheck, automated tests, and browser-based mobile checks are evidenced.

## Test data policy
Use non-production payment processor credentials and synthetic identities only. No live charges, deployments, or merges.

## Current verification
No functional tests or billing integration tests executed by this workstream yet. This document is a coordination contract, not evidence of a working feature.
