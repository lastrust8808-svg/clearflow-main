import type { BillRecord, CoreDataBundle, InstrumentRecord, VendorRecord } from '../types/core';

export type SecurityMerchantSourceKey =
  | 'internal_bonded_pool'
  | 'dtcc'
  | 'emma'
  | 'openfigi'
  | 'treasurydirect'
  | 'fidelity'
  | 'henion_walsh'
  | 'court_cris'
  | 'tops'
  | 'court_docket'
  | 'sec_edgar'
  | 'manual';

export type SecurityMerchantIdentifierType =
  | 'cusip'
  | 'isin'
  | 'book_entry_identifier'
  | 'recorder_book_page'
  | 'recording_number'
  | 'issuer_name'
  | 'pool_reference'
  | 'account_number'
  | 'statement_number'
  | 'court_docket'
  | 'court_ticket'
  | 'cris_reference'
  | 'tops_reference'
  | 'contract_number';

export interface SecurityMerchantSourceDefinition {
  key: SecurityMerchantSourceKey;
  label: string;
  category:
    | 'internal'
    | 'depository'
    | 'municipal'
    | 'brokerage'
    | 'court_claims'
    | 'government_offset'
    | 'registry'
    | 'manual';
  searchPosture: 'internal_search' | 'public_search' | 'client_portal' | 'manual_only';
  supportedIdentifierTypes: SecurityMerchantIdentifierType[];
  supportedRecordKinds: Array<
    | 'reserve_security'
    | 'municipal_bond'
    | 'corporate_note'
    | 'utility_bill'
    | 'credit_card_statement'
    | 'court_claim'
    | 'serviced_contract'
    | 'general_security'
  >;
  description: string;
  officialUrl?: string;
}

export interface SecurityMerchantSuggestion {
  key: SecurityMerchantSourceKey;
  label: string;
  reason: string;
  identifierHints: string[];
  officialUrl?: string;
  searchPosture: SecurityMerchantSourceDefinition['searchPosture'];
}

const securityMerchantCatalog: SecurityMerchantSourceDefinition[] = [
  {
    key: 'internal_bonded_pool',
    label: 'Internal Bonded Pool / Reserve Ledger',
    category: 'internal',
    searchPosture: 'internal_search',
    supportedIdentifierTypes: [
      'pool_reference',
      'issuer_name',
      'cusip',
      'isin',
      'book_entry_identifier',
      'account_number',
    ],
    supportedRecordKinds: [
      'reserve_security',
      'municipal_bond',
      'corporate_note',
      'utility_bill',
      'credit_card_statement',
      'serviced_contract',
      'general_security',
    ],
    description:
      'Use the internal reserve asset and instrument ledger first when statements or obligations should point back to a specified bonded pool already tracked inside ClearFlow.',
  },
  {
    key: 'dtcc',
    label: 'DTCC API Marketplace',
    category: 'depository',
    searchPosture: 'client_portal',
    supportedIdentifierTypes: [
      'cusip',
      'isin',
      'pool_reference',
      'book_entry_identifier',
      'issuer_name',
    ],
    supportedRecordKinds: [
      'reserve_security',
      'municipal_bond',
      'corporate_note',
      'general_security',
    ],
    description:
      'Institutional depository and post-trade source for book-entry securities, pool servicing context, and lifecycle status where DTCC client access exists.',
    officialUrl: 'https://www.dtcc.com/api',
  },
  {
    key: 'emma',
    label: 'MSRB EMMA',
    category: 'municipal',
    searchPosture: 'public_search',
    supportedIdentifierTypes: ['cusip', 'issuer_name', 'pool_reference'],
    supportedRecordKinds: ['reserve_security', 'municipal_bond', 'utility_bill', 'general_security'],
    description:
      'Use for municipal issuer disclosure, event notices, liquidity review, and bond-reference searches when reserve or utility obligations trace back to municipal paper.',
    officialUrl: 'https://emma.msrb.org/',
  },
  {
    key: 'openfigi',
    label: 'OpenFIGI Search',
    category: 'registry',
    searchPosture: 'public_search',
    supportedIdentifierTypes: ['cusip', 'isin', 'issuer_name'],
    supportedRecordKinds: ['reserve_security', 'municipal_bond', 'corporate_note', 'general_security'],
    description:
      'Identifier-normalization source for cross-walking market identifiers before posting reserve holdings or tracing statement-backed security references.',
    officialUrl: 'https://www.openfigi.com/search',
  },
  {
    key: 'treasurydirect',
    label: 'TreasuryDirect Marketable Securities',
    category: 'registry',
    searchPosture: 'public_search',
    supportedIdentifierTypes: ['issuer_name', 'pool_reference', 'statement_number'],
    supportedRecordKinds: ['reserve_security', 'municipal_bond', 'general_security'],
    description:
      'Reference public Treasury security programs, rates, and issue context when reserve holdings or statements tie back to Treasury marketable paper.',
    officialUrl: 'https://www.treasurydirect.gov/marketable-securities/',
  },
  {
    key: 'fidelity',
    label: 'Fidelity Fixed Income / Custody',
    category: 'brokerage',
    searchPosture: 'client_portal',
    supportedIdentifierTypes: ['cusip', 'isin', 'issuer_name', 'account_number', 'statement_number'],
    supportedRecordKinds: ['reserve_security', 'municipal_bond', 'corporate_note', 'credit_card_statement', 'general_security'],
    description:
      'Brokerage or custody-side search path for municipal, corporate, and reserve-linked fixed-income positions when the user already holds them through Fidelity channels.',
    officialUrl: 'https://www.fidelity.com/fixed-income-bonds/overview',
  },
  {
    key: 'henion_walsh',
    label: 'Henion & Walsh Municipal Bonds',
    category: 'brokerage',
    searchPosture: 'client_portal',
    supportedIdentifierTypes: ['cusip', 'issuer_name', 'pool_reference', 'statement_number'],
    supportedRecordKinds: ['reserve_security', 'municipal_bond', 'utility_bill', 'general_security'],
    description:
      'Municipal-bond search and brokerage path for issuer, CUSIP, and statement-backed municipal reserve paper.',
    officialUrl: 'https://www.henionandwalsh.com/',
  },
  {
    key: 'court_cris',
    label: 'Court CRIS / Registry Funds',
    category: 'court_claims',
    searchPosture: 'manual_only',
    supportedIdentifierTypes: ['court_docket', 'court_ticket', 'cris_reference', 'recording_number'],
    supportedRecordKinds: ['court_claim', 'serviced_contract', 'general_security'],
    description:
      'Court-side registry or CRIS reference search for docket-number-linked obligations, deposits, or receivable-style claims that must be traced through court administration identifiers.',
  },
  {
    key: 'tops',
    label: 'TOPS / Offset Claim Source',
    category: 'government_offset',
    searchPosture: 'manual_only',
    supportedIdentifierTypes: ['tops_reference', 'account_number', 'statement_number', 'contract_number'],
    supportedRecordKinds: ['court_claim', 'serviced_contract', 'general_security'],
    description:
      'Use for offset-reference or government-claim style identifiers when a claim, ticket, or serviced obligation points into a Treasury offset or administrative recovery channel.',
  },
  {
    key: 'court_docket',
    label: 'Court Docket / Ticket Search',
    category: 'court_claims',
    searchPosture: 'manual_only',
    supportedIdentifierTypes: ['court_docket', 'court_ticket', 'recording_number'],
    supportedRecordKinds: ['court_claim', 'serviced_contract', 'general_security'],
    description:
      'Manual docket and citation search path for court-administered obligations, tickets, and clerk-record identifiers that need to be tied back to a receivable or pledged claim file.',
  },
  {
    key: 'sec_edgar',
    label: 'SEC EDGAR',
    category: 'registry',
    searchPosture: 'public_search',
    supportedIdentifierTypes: ['issuer_name', 'contract_number', 'pool_reference'],
    supportedRecordKinds: ['reserve_security', 'corporate_note', 'serviced_contract', 'general_security'],
    description:
      'Filing and issuer-evidence search path for corporate notes, securitized contracts, and private/public security context.',
    officialUrl: 'https://www.sec.gov/edgar/search/',
  },
  {
    key: 'manual',
    label: 'Manual Reference',
    category: 'manual',
    searchPosture: 'manual_only',
    supportedIdentifierTypes: [
      'account_number',
      'statement_number',
      'pool_reference',
      'contract_number',
      'issuer_name',
    ],
    supportedRecordKinds: [
      'reserve_security',
      'municipal_bond',
      'corporate_note',
      'utility_bill',
      'credit_card_statement',
      'court_claim',
      'serviced_contract',
      'general_security',
    ],
    description:
      'Fallback when the operator needs to retain a custom identifier or merchant path that is not yet represented by a live or public search connector.',
  },
];

export function getSecurityMerchantCatalog() {
  return securityMerchantCatalog;
}

export function getSecurityMerchantSource(
  key: SecurityMerchantSourceKey,
) {
  return securityMerchantCatalog.find((item) => item.key === key);
}

function normalizeText(...parts: Array<string | undefined | null>) {
  return parts
    .map((part) => (part || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function detectCreditCardText(text: string) {
  return (
    text.includes('credit card') ||
    text.includes('visa') ||
    text.includes('mastercard') ||
    text.includes('american express') ||
    text.includes('discover') ||
    text.includes('cardmember')
  );
}

function detectCourtText(text: string) {
  return (
    text.includes('court') ||
    text.includes('docket') ||
    text.includes('ticket') ||
    text.includes('citation') ||
    text.includes('summons') ||
    text.includes('cris')
  );
}

function detectTopsText(text: string) {
  return text.includes('tops') || text.includes('offset');
}

export function buildSecurityMerchantSuggestions(input: {
  data: CoreDataBundle;
  bill?: BillRecord | null;
  vendor?: VendorRecord | null;
}): SecurityMerchantSuggestion[] {
  const { data, bill, vendor } = input;
  const text = normalizeText(
    vendor?.name,
    bill?.billNumber,
    bill?.extractedVendorName,
    bill?.extractionSummary,
    bill?.notes,
  );
  const identifierHints = Array.from(
    new Set(
      [
        bill?.billNumber,
        bill?.extractedVendorName,
        vendor?.name,
        vendor?.vendorSourceProfile?.locationId,
      ].filter(Boolean) as string[],
    ),
  );
  const kindHints = new Set<SecurityMerchantSourceDefinition['supportedRecordKinds'][number]>();
  kindHints.add('general_security');

  if (vendor?.counterpartyTermsProfile?.organizationClass === 'utility') {
    kindHints.add('utility_bill');
    kindHints.add('municipal_bond');
  }
  if (
    vendor?.counterpartyTermsProfile?.organizationClass === 'large_bank' ||
    detectCreditCardText(text)
  ) {
    kindHints.add('credit_card_statement');
    kindHints.add('corporate_note');
  }
  if (detectCourtText(text)) {
    kindHints.add('court_claim');
  }
  if (vendor?.counterpartyTermsProfile?.organizationClass === 'servicer') {
    kindHints.add('serviced_contract');
  }

  const internalBondedPoolMatches = [
    ...data.assets.filter((asset) => asset.category === 'security'),
    ...data.instruments.filter((instrument) => instrument.sourceClass === 'bond'),
  ]
    .filter((item) => {
      const targetText =
        'name' in item
          ? normalizeText(item.name, item.issuerName, item.identifierCode, item.notes)
          : normalizeText(item.title, item.issuerName, item.identifierCode, item.notes);
      return (
        (vendor?.name && targetText.includes(vendor.name.trim().toLowerCase())) ||
        (bill?.extractedVendorName &&
          targetText.includes(bill.extractedVendorName.trim().toLowerCase())) ||
        (bill?.billNumber && targetText.includes(bill.billNumber.trim().toLowerCase()))
      );
    })
    .slice(0, 3)
    .map((item) => ('name' in item ? item.name : item.title));

  const suggestions: SecurityMerchantSuggestion[] = [];
  const addSuggestion = (key: SecurityMerchantSourceKey, reason: string) => {
    const source = getSecurityMerchantSource(key);
    if (!source || suggestions.some((item) => item.key === key)) {
      return;
    }
    suggestions.push({
      key,
      label: source.label,
      reason,
      identifierHints,
      officialUrl: source.officialUrl,
      searchPosture: source.searchPosture,
    });
  };

  if (internalBondedPoolMatches.length) {
    addSuggestion(
      'internal_bonded_pool',
      `Matched internal reserve candidates: ${internalBondedPoolMatches.join(', ')}.`,
    );
  } else {
    addSuggestion(
      'internal_bonded_pool',
      'Review internal reserve assets and bond instruments first when the account or obligation should tie back to a specified bonded pool.',
    );
  }

  if (kindHints.has('utility_bill')) {
    addSuggestion(
      'emma',
      'Utility or telecom billing can trace back to municipal or utility-sector reserve paper, disclosure records, or bond-backed source review.',
    );
    addSuggestion(
      'henion_walsh',
      'Useful when the utility or municipal reserve source is best traced through municipal bond search and brokerage-side paper.',
    );
  }

  if (kindHints.has('credit_card_statement')) {
    addSuggestion(
      'fidelity',
      'Credit-account or large-bank obligations can be reviewed against custody or brokerage-side fixed-income and securitized account references.',
    );
    addSuggestion(
      'dtcc',
      'Large-bank or card-linked obligations may require institutional post-trade or depository context when tied to securitized pools.',
    );
  }

  if (kindHints.has('court_claim')) {
    addSuggestion(
      'court_cris',
      'Court, docket, ticket, or CRIS language was detected in the record, so court-registry identifiers should be searchable here.',
    );
    addSuggestion(
      'court_docket',
      'Use docket or citation search when the receivable/claim source is controlled through clerk or court identifiers.',
    );
  }

  if (detectTopsText(text)) {
    addSuggestion(
      'tops',
      'TOPS or offset-style language was detected, so this claim may need an offset-reference search path.',
    );
  }

  if (kindHints.has('municipal_bond')) {
    addSuggestion(
      'openfigi',
      'Cross-walk the identifier into broader market references before linking the bill or contract to a bonded pool.',
    );
  }

  if (kindHints.has('corporate_note') || kindHints.has('serviced_contract')) {
    addSuggestion(
      'sec_edgar',
      'Corporate or serviced-contract posture can benefit from issuer filing and securitized-contract evidence review.',
    );
  }

  if (!suggestions.some((item) => item.key === 'dtcc')) {
    addSuggestion(
      'dtcc',
      'Use when the underlying contract, note, or reserve security must be matched against institutional depository or pool-servicing records.',
    );
  }

  addSuggestion(
    'manual',
    'Capture any merchant-specific identifier path that is not yet represented by a live catalog source.',
  );

  return suggestions.slice(0, 6);
}
