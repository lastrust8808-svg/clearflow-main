# ClearFlow Biller-Direct Execution Requirements

ClearFlow already classifies utility, servicer, tax, and lockbox-style payments as `account application / biller-direct`.

To make biller-direct fully executable instead of staged, ClearFlow still needs:

1. A real bank-bill-pay or biller-direct provider
- bank bill pay API or FI partner that can submit biller payments
- or a direct biller/payment network connector

2. Durable payee reference mapping
- biller account number
- processing/coupon reference
- service address or customer identifier when required
- delivery endpoint metadata per biller

3. Positive delivery evidence
- provider payment id
- bank trace / bill pay trace
- biller confirmation id when available
- return / rejection / exception reason codes

4. Application proof loop
- `submitted`
- `accepted`
- `processing`
- `received`
- `applied`
- `closed`

5. Counterparty-safe routing controls
- utility / servicer / tax / lockbox payees default to biller-direct
- generic ACH/wire disabled when the payee is not a true bank beneficiary
- staged retention remains available even when execution is not yet live

Recommended connector classes:
- bank bill pay / FI payment APIs
- treasury execution providers for open-bank rails
- biller-direct aggregators or direct biller integrations for utilities, telecoms, and servicers

Current ClearFlow truth:
- live bank ACH execution can be ready through the bank execution provider posture
- biller-direct is still staged unless a dedicated biller-direct or bank-bill-pay rail is added
- printable check plus Positive Pay support records can be staged now as a bridge rail for billers that accept mailed checks
