export type ConversionConnectorAccess =
  | 'public_data_api'
  | 'filer_api'
  | 'client_marketplace'
  | 'partner_bank_required'
  | 'provider_api'
  | 'custodian_or_broker_required'
  | 'manual_portal';

export interface ConversionConnectorDefinition {
  key: string;
  label: string;
  category:
    | 'registry'
    | 'depository'
    | 'bank_rail'
    | 'treasury'
    | 'brokerage'
    | 'custody'
    | 'escrow'
    | 'payment_operations';
  access: ConversionConnectorAccess;
  executionPosture: 'data_only' | 'status_and_records' | 'execution_partner_required' | 'execution_capable_when_approved';
  bestUse: string;
  conversionRole: string;
  nextSetupStep: string;
  officialUrl: string;
}

export const conversionConnectorCatalog: ConversionConnectorDefinition[] = [
  {
    key: 'sec-edgar-data',
    label: 'SEC EDGAR Public Data APIs',
    category: 'registry',
    access: 'public_data_api',
    executionPosture: 'data_only',
    bestUse: 'Verify issuer filings, offering history, CIK, accession references, and XBRL facts before securities-backed conversion.',
    conversionRole:
      'Evidence and diligence rail. It does not convert securities to cash, but it validates offering and filing context for private-placement or securities-backed collateral.',
    nextSetupStep: 'Add CIK/accession fields, filing lookup, and filing evidence attachment to the conversion packet.',
    officialUrl: 'https://www.sec.gov/edgar/sec-api-documentation',
  },
  {
    key: 'sec-edgar-next-filer',
    label: 'SEC EDGAR Next Filer APIs',
    category: 'registry',
    access: 'filer_api',
    executionPosture: 'status_and_records',
    bestUse: 'Submit and check status for EDGAR filings when a user/entity is an enrolled EDGAR Next filer.',
    conversionRole:
      'Registration and filing workflow rail for private offerings or securities filings tied to instruments; not a cash settlement rail.',
    nextSetupStep: 'Create filer-token setup checklist and store live/test submission status references.',
    officialUrl:
      'https://www.sec.gov/submit-filings/filer-support-resources/how-do-i-guides/understand-edgar-application-programming-interfaces-apis',
  },
  {
    key: 'dtcc-api-marketplace',
    label: 'DTCC API Marketplace',
    category: 'depository',
    access: 'client_marketplace',
    executionPosture: 'execution_partner_required',
    bestUse: 'Securities lifecycle data, post-trade records, asset servicing, settlement status, and institutional connectivity where the user/provider is an eligible DTCC client.',
    conversionRole:
      'Institutional securities rail. Useful for depository/status integration, but cash proceeds still depend on broker, custodian, clearing member, or bank settlement.',
    nextSetupStep: 'Add DTCC client onboarding checklist, OAuth/MFA posture, product scope, and clearing/custodian contact fields.',
    officialUrl: 'https://www.dtcc.com/api',
  },
  {
    key: 'fedwire-iso20022',
    label: 'Fedwire Funds ISO 20022',
    category: 'bank_rail',
    access: 'partner_bank_required',
    executionPosture: 'execution_partner_required',
    bestUse: 'High-value final cash movement after collateral is already converted and bank-recognized.',
    conversionRole:
      'Final funds rail through a participating financial institution; ClearFlow should generate/retain instructions and trace/status, not claim direct Fedwire access without a bank participant.',
    nextSetupStep: 'Map conversion proceeds to verified bank account, wire beneficiary, ISO 20022 payment message fields, and bank trace proof.',
    officialUrl: 'https://www.frbservices.org/resources/financial-services/wires/faq/iso-20022/overview-implementation-details',
  },
  {
    key: 'treasury-fiscal-data',
    label: 'U.S. Treasury Fiscal Data APIs',
    category: 'treasury',
    access: 'public_data_api',
    executionPosture: 'data_only',
    bestUse: 'Reference Treasury rates, public debt, fiscal datasets, and public-market context for treasury/security records.',
    conversionRole:
      'Reference-data rail. It supports valuation, evidence, and public data checks, but it does not originate TreasuryDirect transfers or liquidate holdings.',
    nextSetupStep: 'Add dataset selector and attach retrieved rate/debt/security reference snapshots to conversion review.',
    officialUrl: 'https://fiscaldata.treasury.gov/api-documentation/',
  },
  {
    key: 'stripe-treasury',
    label: 'Stripe Treasury Financial Accounts',
    category: 'treasury',
    access: 'provider_api',
    executionPosture: 'execution_capable_when_approved',
    bestUse: 'Embedded financial accounts, money movement, and platform-controlled treasury workflows where Stripe Treasury eligibility is approved.',
    conversionRole:
      'Possible destination/source account rail for converted cash after provider onboarding; not a securities broker or collateral liquidation venue by itself.',
    nextSetupStep: 'Add Stripe Treasury eligibility, connected account, financial account, and money-movement feature status fields.',
    officialUrl: 'https://docs.stripe.com/api/treasury/financial_accounts',
  },
  {
    key: 'modern-treasury',
    label: 'Modern Treasury Payments & Ledgers',
    category: 'payment_operations',
    access: 'provider_api',
    executionPosture: 'execution_capable_when_approved',
    bestUse: 'Payment orders, approval workflows, ledgers, reconciliation, and bank-connected ACH/wire/RTP/FedNow operations.',
    conversionRole:
      'Operations rail that can move and reconcile cash through connected bank relationships; liquidation still requires the selling/custody provider.',
    nextSetupStep: 'Add bank connection approval, payment order, ledger account, counterparty, and reconciliation object mapping.',
    officialUrl: 'https://docs.moderntreasury.com/',
  },
  {
    key: 'qualified-custodian-broker',
    label: 'Qualified Custodian / Broker-Dealer',
    category: 'custody',
    access: 'custodian_or_broker_required',
    executionPosture: 'execution_partner_required',
    bestUse: 'Sell or borrow against securities, notes, funds, or custody-held assets through a regulated account relationship.',
    conversionRole:
      'Primary executable conversion venue for securities or custody-held instruments; ClearFlow should retain trade tickets, settlement confirmations, wires, and bank receipt matches.',
    nextSetupStep: 'Capture custodian name, account, authorized signer, instrument identifier, trade ticket, settlement date, and cash sweep destination.',
    officialUrl: 'https://www.finra.org/investors/insights/working-broker-dealers-and-investment-advisers',
  },
  {
    key: 'alpaca-broker-api',
    label: 'Alpaca Broker API',
    category: 'brokerage',
    access: 'provider_api',
    executionPosture: 'execution_capable_when_approved',
    bestUse: 'API brokerage, equities/crypto trading, fractional liquidation, account opening, transfers, and reporting where brokerage approvals are in place.',
    conversionRole:
      'Executable brokerage rail for marketable securities or crypto positions held in approved Alpaca accounts; cash availability depends on trade settlement, account type, and withdrawal/transfer rules.',
    nextSetupStep: 'Add brokerage onboarding, account status, asset symbol, order ticket, trade status, settlement date, and cash withdrawal destination fields.',
    officialUrl: 'https://docs.alpaca.markets/docs/brokerapi-trading',
  },
  {
    key: 'drivewealth-baas',
    label: 'DriveWealth Brokerage-as-a-Service',
    category: 'brokerage',
    access: 'provider_api',
    executionPosture: 'execution_capable_when_approved',
    bestUse: 'Embedded investing, fractional equity access, global brokerage accounts, and portfolio liquidation through a B2B brokerage platform.',
    conversionRole:
      'Brokerage infrastructure candidate for converting marketable portfolio positions into settled cash, subject to DriveWealth partnership approval and brokerage custody.',
    nextSetupStep: 'Track partner application, brokerage account, trade order, settlement, and cash sweep / ACH destination mapping.',
    officialUrl: 'https://www.drivewealth.com/',
  },
  {
    key: 'gbi-precious-metals',
    label: 'GBI Physical Precious Metals Platform',
    category: 'custody',
    access: 'provider_api',
    executionPosture: 'execution_capable_when_approved',
    bestUse: 'Institutional precious-metals trading, custody, vaulting, dealer liquidity, and wealth-platform integration.',
    conversionRole:
      'Physical-metals rail for turning allocated gold, silver, and other metals into trade confirmations and cash proceeds through an institutional platform.',
    nextSetupStep: 'Add GBI partner setup, vault/custody reference, metal allocation, trade ticket, dealer price, settlement statement, and bank receipt match.',
    officialUrl: 'https://gbi.co/platform/',
  },
  {
    key: 'minted-connect',
    label: 'Minted Connect Metals API',
    category: 'custody',
    access: 'provider_api',
    executionPosture: 'execution_capable_when_approved',
    bestUse: 'API-first gold/silver/platinum/palladium buying, selling, transfer, tokenized metal, custody, and redemption flows.',
    conversionRole:
      'Metals API rail for fractional, vaulted, or tokenized precious-metal positions; cash recognition requires provider settlement and bank receipt proof.',
    nextSetupStep: 'Capture metal symbol, gram/ounce balance, vault proof, sell order, provider settlement ID, redemption option, and cash destination.',
    officialUrl: 'https://mintedconnect.com/',
  },
  {
    key: 'goldwise-connect',
    label: 'Goldwise Connect',
    category: 'custody',
    access: 'provider_api',
    executionPosture: 'execution_capable_when_approved',
    bestUse: 'Physical precious-metals pricing, order execution, allocation, vaulting, and operations for wealth platforms.',
    conversionRole:
      'Metals execution and allocation rail using live executable prices, order management, and metal ledger/custody workflows.',
    nextSetupStep: 'Add environment setup, price quote, order type, allocated ledger balance, custody proof, sell confirmation, and proceeds receipt.',
    officialUrl: 'https://www.goldwise.com/goldwise-connect/',
  },
  {
    key: 'stonex-precious-metals',
    label: 'StoneX Precious Metals',
    category: 'brokerage',
    access: 'provider_api',
    executionPosture: 'execution_partner_required',
    bestUse: 'Institutional precious-metals physical trading, OTC, forwards, swaps, options, financing, custody, clearing, and vaulting.',
    conversionRole:
      'Institutional metals and commodity-finance rail where financing, hedging, clearing, custody, and physical liquidation need one professional counterparty.',
    nextSetupStep: 'Capture StoneX account/desk contact, custody location, metal form, OTC trade or financing term sheet, margin/collateral terms, and settlement proof.',
    officialUrl: 'https://www.stonex.com/en-us/business/commodities/precious-metals/',
  },
  {
    key: 'tzero-transfer-agent',
    label: 'tZERO Transfer Agent / Private Securities',
    category: 'depository',
    access: 'provider_api',
    executionPosture: 'status_and_records',
    bestUse: 'Private securities cap table, transfer-agent services, Reg D/A+/CF/S offering support, corporate actions, and issuer recordkeeping.',
    conversionRole:
      'Private-securities record and potential liquidity-prep rail. It supports issuance/transfer/cap-table evidence, while actual cash liquidity depends on trading venue, brokerage account, investor purchase, or approved secondary transaction.',
    nextSetupStep: 'Add issuer onboarding, exemption type, cap-table record, investor status, transfer restriction, corporate action, and liquidity event reference fields.',
    officialUrl: 'https://tzero.com/transfer-agent/',
  },
  {
    key: 'finitive-credit-marketplace',
    label: 'Finitive Private Credit Marketplace',
    category: 'payment_operations',
    access: 'manual_portal',
    executionPosture: 'execution_partner_required',
    bestUse: 'Private credit marketplace access to institutional investors and capital providers for specialty finance, online lending, marketplace lending, and private credit funds.',
    conversionRole:
      'Capital matching rail for converting portfolios, receivables, loans, or private credit opportunities into financed proceeds through investor funding.',
    nextSetupStep: 'Build borrower/deal package checklist, loan tape upload, collateral summary, investor match status, term sheet, closing, and funding receipt fields.',
    officialUrl: 'https://www.finitive.com/',
  },
  {
    key: 'aria-invoice-financing',
    label: 'Aria Embedded Invoice Financing',
    category: 'payment_operations',
    access: 'provider_api',
    executionPosture: 'execution_capable_when_approved',
    bestUse: 'Embedded invoice financing, supplier instant payment, debtor risk scoring, payment, insurance, collections, and reconciliation.',
    conversionRole:
      'Receivables conversion rail. It can turn eligible invoices into accelerated supplier cash where Aria supports the market, risk decision, and payment flow.',
    nextSetupStep: 'Map invoice, debtor, buyer approval, KYB/KYC, risk score, purchase/financing status, payout, fee, collections, and reconciliation references.',
    officialUrl: 'https://www.helloaria.eu/',
  },
  {
    key: 'sapi-embedded-credit',
    label: 'SAPI Embedded Credit',
    category: 'payment_operations',
    access: 'provider_api',
    executionPosture: 'execution_capable_when_approved',
    bestUse: 'API-based lending lifecycle: offers, disbursements, repayments, and embedded credit program management.',
    conversionRole:
      'Credit rail for turning eligible collateral, contracts, or business receivables into approved loan proceeds, subject to credit product setup and underwriting.',
    nextSetupStep: 'Add credit product, applicant, collateral package, offer, signed agreement, disbursement, repayment, and bank receipt mapping.',
    officialUrl: 'https://sapi-platform.com/technology/',
  },
  {
    key: 'lendapi-capital',
    label: 'LendAPI Capital / Embedded Finance',
    category: 'payment_operations',
    access: 'provider_api',
    executionPosture: 'execution_partner_required',
    bestUse: 'Loan origination, loan management, embedded finance, POS lending, real-estate lending, capital matching, and credit workflow automation.',
    conversionRole:
      'Debt/collateral financing rail for packaging notes, collateral, or acquisition opportunities into underwritten loan proceeds through approved lenders/capital providers.',
    nextSetupStep: 'Track application, borrower, collateral documents, underwriting status, lender/capital match, loan agreement, disbursement, and treasury receipt.',
    officialUrl: 'https://www.lendapi.com/capital',
  },
  {
    key: 'escrow-title-agent',
    label: 'Escrow / Title Settlement Agent',
    category: 'escrow',
    access: 'manual_portal',
    executionPosture: 'execution_partner_required',
    bestUse: 'Contract deposits, sale proceeds, title-company wires, asset closings, and third-party settlement statements.',
    conversionRole:
      'Settlement evidence and cash call rail. Useful when contract/debt/property rights convert through closing statements and verified wire instructions.',
    nextSetupStep: 'Attach escrow letter, settlement statement, verified wire instructions, title receipt, and closing disbursement proof.',
    officialUrl: 'https://www.alta.org/business-tools/title-insurance-and-settlement-company-best-practices',
  },
];

export function getConversionConnectorCatalog() {
  return conversionConnectorCatalog;
}
