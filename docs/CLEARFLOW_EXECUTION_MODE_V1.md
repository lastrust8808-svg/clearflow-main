# ClearFlow Execution Mode v1

## Goal

Move ClearFlow from a settlement-control application into a truthful execution system.

That means every outbound payment must visibly land in one of these states:

- retained internally only
- staged for release
- submitted to a live provider
- accepted by a live provider
- processing
- settled
- returned or failed
- applied by the payee when application evidence exists

## Core Rule

ClearFlow must never show a payment as externally settled merely because:

- a journal entry exists
- a remittance was posted
- a settlement token was issued
- a draft execution route was selected

## Provider Classes

### 1. Bank-Rail Providers

Used for normal ACH, wire, RTP, or FedNow style execution when the payee is a true bank payee.

Examples:

- Plaid-based bank execution posture
- bank-originated ACH partner
- wire execution partner

### 2. Biller-Direct Providers

Used when the counterparty behaves like a utility, servicer, credit card issuer, or lockbox biller rather than a normal bank-payee.

Examples:

- utility pay rails
- bill pay connectors
- bank bill pay proxy rails

### 3. Wallet / Chain Providers

Used for digital-asset and on-chain execution with:

- broadcast evidence
- transaction hash
- confirmation status

## Canonical Execution Record

Each execution record should retain:

- provider
- execution mode
- payee type
- source type
- execution rail
- provider reference
- external status
- verification status
- live execution boolean
- reason or exception narrative

## Payee Types

- `bank_payee`
- `biller_direct`
- `manual_payee`

## Truthful Status Model

### Internal Status

- `draft`
- `queued`
- `processing`
- `settled`
- `requires_review`
- `blocked`

### External Status

- `draft`
- `submitted`
- `accepted`
- `processing`
- `settled`
- `returned`
- `failed`
- `applied`
- `manual_review`
- `staged`

## DTE / Utility Standard

DTE-style remittances should default to `biller_direct` unless a true bank-payee receive method is verified.

That means:

- remittance can still be retained
- accounting can still be posted
- settlement can still be tracked
- but external execution must remain `manual_review` or `staged` until a real biller-direct provider exists

## Current Implementation Standard

The current repo now distinguishes:

- `executionMode`
  - `live`
  - `staged`
- `executionProvider`
  - `plaid`
  - `manual`
- `payeeType`
  - `bank_payee`
  - `biller_direct`
  - `manual_payee`
- `liveExecution`
  - true only when the provider or wallet path is genuinely live

## Next Build Steps

1. Add a dedicated provider adapter layer for each provider.
2. Persist provider webhooks and execution timelines durably.
3. Add operator controls to retry, release, or reroute staged payments.
4. Add biller-direct adapters for utility and lockbox payments.
5. Add application-proof intake so the payee-applied state can be retained.

## Product Claim Standard

ClearFlow earns the phrase `execution mode` only when users can see:

- what was merely recorded
- what was actually submitted
- what provider received it
- what reference or trace proves it
- whether the payee truly applied it
