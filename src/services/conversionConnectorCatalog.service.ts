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
