# Mercury Books ↔ ClearFlow Chart of Accounts Alignment

Date: 2026-11-21  
Branch: `workstream/coa-mercury-alignment-2026-11-21`

## Rule

Mercury Books is the canonical naming/type/sort-code source for ordinary business accounting accounts. ClearFlow keeps its own control accounts only where Mercury does not expose an equivalent ledger concept.

Do not hard-code Mercury ledger IDs into the shared application. Mercury ledger IDs are organization-specific. ClearFlow stores canonical Mercury names/sort codes in the shared chart and may persist a connected entity's current `mercuryLedgerId` after runtime matching.

## AAC operating mappings

| ClearFlow purpose | Mercury Books canonical account | Sort code | ClearFlow treatment |
| --- | --- | ---: | --- |
| Operating bank cash | Cash and Cash Equivalents | 10000 | Shared / mapped |
| Physical cash withdrawals awaiting use classification | Petty Cash | 10100 | Shared / mapped |
| Savings/reserve bank buckets | Savings and Treasury Accounts | 10300 | Shared / mapped |
| Processor balances | Payment Processor Balances | 10400 | Shared / mapped |
| Checks/receipts not yet deposited | Undeposited Funds | 10600 | Shared / mapped |
| Job materials consumed | Cost of Revenue: Inventory | 51100 | Shared / mapped |
| Direct job helper/contract labor | Cost of Revenue: Contractors | 51600 | Shared / mapped |
| General contractors/consultants not tied directly to a job | Contractors and Consultants | 53180 | Shared / mapped |
| Owner-funded AAC costs | Owner, Partner, or Member Contributions | 32200 | Shared / mapped |
| Owner pay / personal charges / transfers into Chase | Owner, Partner, or Member Draws | 32300 | Shared / mapped |
| Service/job income | Services Revenue | 41200 | Shared / mapped |
| Fuel/vehicle | Gas and Auto | 55390 | Shared / mapped |
| Tools/equipment | Equipment and Small Tools | 55640 | Shared / mapped |
| Bank/ATM fees only | Bank Fees | 55680 | Shared / mapped |
| Items awaiting evidence | Uncategorized Cash Outflow | 59900 | Shared / mapped |

## Current AAC Mercury source accounts

Mercury creates organization-specific source ledgers (for example Checking/Savings account masks with sort codes in the 10001+ range). These should be represented in ClearFlow as connected `bankAccounts` linked to the generic chart category, not duplicated as global chart templates.

For AAC, the current Mercury structure includes:
- operating Spend/checking
- Receivables/checking
- Payroll H&K/checking
- Capital/Investments savings
- TAXES savings
- Overage/Savings

Their exact Mercury ledger IDs must be matched at connection/runtime, not committed to shared source code.

## ClearFlow-only control accounts

These stay in ClearFlow because forcing them into a Mercury account would change their meaning:
- Accounts Receivable
- Accounts Payable
- Digital Asset Holdings
- Private Notes Receivable
- Intercompany Receivable
- Remittance Obligations Clearing
- Unapplied Cash
- Digital Asset Clearing
- Digital Asset Disbursements
- Network Fees

They are marked `clearflow_extension` and can still participate in internal journal, remittance, trust, reserve, and settlement workflows.

## Compatibility behavior

For business entities (LLC, corporation, partnership, nonprofit), opening Accounting reconciles the entity chart against the Mercury-compatible template:
1. Match by Mercury sort code/canonical name when already mapped.
2. Match known legacy ClearFlow names/codes (for example Operating Cash and Service Revenue).
3. Preserve existing account IDs and balances.
4. Canonicalize matched name/code/type/subtype/normal balance.
5. Add missing shared accounts at zero balance.
6. Add required ClearFlow control accounts as explicit extensions.
7. Leave trust/non-business charts alone; they require their own trust/reserve chart rather than inheriting an LLC operating chart.

No payments, bank transfers, merges, or deployments are performed by this alignment.
