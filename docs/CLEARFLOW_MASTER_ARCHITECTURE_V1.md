# ClearFlow Master Architecture v1

## Product Standard

ClearFlow should become a single operator OS that replaces fragmented bookkeeping, ERP, treasury, tax, securities, document-retention, and reporting tools with one canonical record graph.

Every real-world event should connect:

- operator
- entity
- counterparty
- source document
- accounting entry
- settlement event
- proof and verification record
- compliance or tax consequence
- retained record
- reporting output

## Best-Of Platform Blend

ClearFlow should deliberately take the strongest operational patterns from:

- QuickBooks
  - simple bookkeeping
  - familiar AR and AP
  - chart of accounts management
  - easy reconciliation expectations
- Odoo
  - modular ERP navigation
  - journal-first accounting workflow
  - operational continuity across desks
- TradeSuite
  - treasury and banking discipline
  - payment rail control
  - exception handling
- TaxSlayer
  - guided filing workflows
  - user-friendly prep logic
  - filing readiness and workpaper discipline
- DTCC / SDX-style posture
  - structured security master data
  - issuance and lifecycle rigor
  - disclosure, holder, and registration discipline
- Datarails
  - CFO reporting
  - budget versus actual
  - scenario and variance analysis

## Core Desks

### 1. Operator Home

- personal overview
- collective overview
- deadlines and exception queue
- multi-entity switching
- retained activity trail

### 2. Entities

- entity setup
- authority
- branding
- connected storage identity
- trust, LLC, nonprofit, and operating-company specific defaults

### 3. Accounting ERP

- receivables
- payables
- remittance and payment operations
- journal
- chart of accounts
- receipts and expenses
- payroll
- bank feed
- reconciliation
- budgeting and variance
- job cost, class, department, or project overlays

### 4. Treasury & Settlement

- bank rails
- internal ledger rails
- wallet rails
- instrument rails
- release, clearing, application, confirmation, and exceptions

### 5. Assets & Reserve

- real estate
- reserve holdings
- collateral
- securities
- futures overlays
- liquidation planning
- digital assets and custody

### 6. Tax & Filing

- EFTPS
- federal and state filing workspaces
- 1099 flows
- tax evidence chains
- filing status and correction workflow

### 7. Securities & Capital Markets

- security master
- holder ledger
- issuance and registration
- disclosure and event watch
- collateral and performance support

### 8. Documents, Vault & Reporting

- retained agreements
- transaction packets
- mailing and dispatch evidence
- internal and external proof trail
- CFO, board, trustee, and compliance reporting

## Navigation Rules

- left sidebar is primary desk navigation
- each desk should have only local subsection navigation
- no cross-desk clutter inside a desk body
- every major action should be visible near the top of the desk
- every completed action should surface immediately in the desk, overview, and ledger

## Accounting Experience Target

Accounting should visually resemble top-tier ERP/accounting software without changing the underlying posting logic.

### Accounting Home Must Show

- receivables snapshot
- payables snapshot
- bank and treasury summary
- journal and reconciliation status
- chart of accounts access
- entity-type-sensitive operating lens

### Entity-Sensitive Lens Examples

- construction business
  - material cost
  - budget variance
  - weekly and monthly inflow and outflow
  - vendor and subcontractor exposure
- trust or estate
  - net worth
  - reserve holdings
  - futures and hedge posture
  - asset appreciation and decline
- operating company
  - sales, cash, bills, payroll, recurring obligations

### Posted Move Cards

Each posted move card should show:

- journal number
- debit and credit accounts
- amount
- reconcile state
- linked transaction count
- linked settlement count
- linked document count

## Canonical Record Model

The system should keep one canonical graph:

- `coreDataSnapshot` as the source of truth in-app
- retained external user-owned document storage where needed
- durable user and entity-scoped storage mirrors
- immediate propagation into dashboard, ledger, overview, and reporting views

## Execution Truth Standard

The app must not claim a real-world payment was executed unless an actual external processor or bank rail originated it.

### Current State

Current bank-originated settlement execution is not yet fully live end-to-end. The current fallback in `src/services/settlementExecution.service.ts` still marks local fallback execution as `simulatedProcessing: true` when the backend execution endpoint is unavailable or incomplete.

That means:

- ClearFlow can record and control remittance and settlement posture
- ClearFlow can prepare bank-backed execution metadata
- ClearFlow does not yet guarantee live ACH origination to the payee from the app by itself

### Required Standard For “Execution Mode”

To say ClearFlow truly sent a vendor remittance through the app, all of these must exist:

- live connected funding account
- live vendor receive method and verified routing instructions
- live processor or bank-originated execution response
- processor reference or bank trace
- settlement status progression
  - initiated
  - processing
  - clearing
  - settled
- application evidence on the payee side when available

## DTE Remittance Truth

For DTE or any utility/vendor remittance, ClearFlow should distinguish:

- internal presentment recorded
- payment sent
- bank-clearing evidence
- vendor application evidence
- closed

Until live ACH origination or a real accepted payment processor path is wired, ClearFlow should not be treated as having fully originated the DTE payment simply because the ERP entry exists.

## Delivery Phases

### Phase 1: Foundation

- auth and session stability
- multi-entity model
- canonical persistence
- document retention
- accounting visibility

### Phase 2: Accounting Flagship

- ERP-style accounting home
- COA editing
- AR and AP
- journal and reconciliation polish
- budget and entity lenses

### Phase 3: Treasury & Execution

- real live bank connection continuity
- real settlement execution
- ACH or wire initiation posture
- trace and confirmation capture

### Phase 4: Tax & Filing

- guided tax workflows
- payment evidence
- filing and correction operations

### Phase 5: Securities & Capital Markets

- security master
- issuance and lifecycle
- holder and disclosure support
- SDX-style structured records where feasible

### Phase 6: Executive Reporting

- board and CFO packs
- variance analysis
- liquidity and covenant monitoring
- trust and reserve reporting

## Cleanup Standard

Every release should include:

- removal of dead code and dead buttons
- removal of legacy unused files
- dashboard validation against actual retained data
- lint and build verification
- clear distinction between simulated and live external execution

## Build Mandate

ClearFlow should be the only software a user needs because it combines:

- operations
- ERP accounting
- treasury
- settlement
- tax
- securities
- retention
- reporting

But it only earns that claim when the app visibly proves every action from start to finish, including the external side when applicable.
