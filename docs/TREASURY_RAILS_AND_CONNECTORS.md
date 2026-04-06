# Treasury Rails And Connectors

## Purpose

This document maps the practical external rails and providers that ClearFlow can use to move between:

- ERP intent
- treasury approval
- bank or processor origination
- confirmation
- reconciliation
- retained proof

## Core Rail Families

### ACH

- standard ACH
- same-day ACH
- NACHA file origination

Use for:

- vendor payments
- recurring disbursements
- payroll-style bank settlement
- operating cash movement

### Wire

- Fedwire posture
- provider-originated domestic wire posture

Use for:

- high-value or time-critical disbursements
- final settlement requirements

### Instant Rails

- FedNow
- RTP

Use for:

- instant business payments
- faster treasury movement
- real-time confirmation posture

### Biller-Direct / Bill Pay

- bank bill pay
- utility or lockbox style remittance
- biller-specific payment rail

Use for:

- DTE-style utilities
- servicers
- coupon-driven billers

## Connector Classes

### Plaid

Best for:

- institution login
- bank feed sync
- account and routing verification
- transfer-oriented bank execution posture when enabled through the provider path

### Dwolla

Best for:

- ACH credits and debits
- wire-capable treasury execution posture
- provider lifecycle status tracking

### Treasury Prime

Best for:

- bank-led ACH and wire origination posture
- treasury and banking product alignment
- account-centric settlement flows

### Modern Treasury

Best for:

- payment operations control
- approval, release, and reconciliation workflows
- multi-bank treasury orchestration
- RTP and FedNow strategy where bank/provider support exists

### Bank Channel / NACHA File

Best for:

- treasury teams that originate through the bank directly
- ACH upload approval flows
- high-control institutional disbursement environments

## Current ClearFlow Standard

ClearFlow should distinguish:

- bank data aggregation
- execution readiness
- payee type
- rail type
- provider truth

Examples:

- Plaid-linked bank account does not automatically mean live wire execution is available.
- Internal ledger control does not automatically mean external payment occurred.
- Utility remittance may require biller-direct or bank bill pay instead of generic ACH vendor payout.

## Official Reference Set

- Nacha overview and rules posture: [nacha.org](https://www.nacha.org/)
- FedNow FAQ: [federalreserve.gov](https://www.federalreserve.gov/paymentsystems/fednow_faq.htm)
- Plaid payments and funding docs: [plaid.com/docs/payments](https://plaid.com/docs/payments/)
- Dwolla transfers: [developers.dwolla.com](https://developers.dwolla.com/docs/connect/api-reference/transfers)
- Treasury Prime ACH docs: [docs.treasuryprime.com](https://docs.treasuryprime.com/docs/incoming-ach)

## Build Direction

1. Keep connected institution login for bank feeds.
2. Add execution providers separately from feed providers.
3. Add biller-direct strategy for utilities and lockbox payees.
4. Keep all external statuses visible in ERP and settlement views.
5. Retain proof for every provider event and every treasury release.
