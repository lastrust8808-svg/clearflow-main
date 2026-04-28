import type { BillRecord, CoreDataBundle, InstrumentRecord, VendorRecord } from '../types/core';

export type SecurityMerchantSourceKey =
  | 'internal_bonded_pool'
  | 'dtcc'
  | 'emma'
  | 'openfigi'
  | 'treasurydirect'
  | 'treasury_fiscal_data'
  | 'finra_trace'
  | 'fidelity'
  | 'henion_walsh'
  | 'court_cris'
  | 'tops'
  | 'court_docket'
  | 'pacer_case_locator'
  | 'ginnie_mae_disclosure'
  | 'freddie_mac_debt'
  | 'freddie_mac_clarity'
  | 'fannie_mae_debt'
  | 'mers_servicerid'
  | 'mers_eregistry'
  | 'fedwire_securities'
  | 'sec_edgar'
  | 'physical_custody'
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
  | 'contract_number'
  | 'min_number'
  | 'pool_number'
  | 'fha_case_number'
  | 'rd_case_number'
  | 'pacer_case_number'
  | 'certificate_number';

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
    key: 'treasury_fiscal_data',
    label: 'Treasury Fiscal Data',
    category: 'registry',
    searchPosture: 'public_search',
    supportedIdentifierTypes: ['cusip', 'issuer_name', 'pool_reference', 'statement_number'],
    supportedRecordKinds: ['reserve_security', 'municipal_bond', 'corporate_note', 'general_security'],
    description:
      'Public Treasury dataset path for auctioned marketable securities, CUSIP-level reference data, and broader federal debt context.',
    officialUrl: 'https://fiscaldata.treasury.gov/datasets/treasury-securities-auctions-data/',
  },
  {
    key: 'finra_trace',
    label: 'FINRA TRACE / Fixed Income',
    category: 'registry',
    searchPosture: 'public_search',
    supportedIdentifierTypes: ['cusip', 'issuer_name', 'pool_reference', 'statement_number'],
    supportedRecordKinds: [
      'reserve_security',
      'municipal_bond',
      'corporate_note',
      'credit_card_statement',
      'general_security',
    ],
    description:
      'Public fixed-income search path for corporate, agency, 144A, and structured-product trade activity and security lookup.',
    officialUrl: 'https://www.finra.org/finra-data/fixed-income',
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
    key: 'pacer_case_locator',
    label: 'PACER Case Locator',
    category: 'court_claims',
    searchPosture: 'client_portal',
    supportedIdentifierTypes: ['court_docket', 'pacer_case_number', 'recording_number'],
    supportedRecordKinds: ['court_claim', 'serviced_contract', 'general_security'],
    description:
      'Federal court case lookup path for docket-number-linked obligations, filings, and nationwide case-index tracing.',
    officialUrl: 'https://pacer.uscourts.gov/find-case/search-national-index',
  },
  {
    key: 'ginnie_mae_disclosure',
    label: 'Ginnie Mae Disclosure Search',
    category: 'registry',
    searchPosture: 'public_search',
    supportedIdentifierTypes: ['cusip', 'pool_number', 'pool_reference', 'fha_case_number', 'rd_case_number'],
    supportedRecordKinds: ['reserve_security', 'corporate_note', 'serviced_contract', 'general_security'],
    description:
      'Public disclosure search for Ginnie Mae MBS, HMBS, REMIC, Platinum pools, factors, and loan-level multifamily references.',
    officialUrl:
      'https://tst.ginniemae.gov/investors/investor_search_tools/Pages/DisclosureSearchTools.aspx',
  },
  {
    key: 'freddie_mac_debt',
    label: 'Freddie Mac Debt Search',
    category: 'registry',
    searchPosture: 'public_search',
    supportedIdentifierTypes: ['cusip', 'isin', 'issuer_name', 'pool_reference'],
    supportedRecordKinds: ['reserve_security', 'corporate_note', 'serviced_contract', 'general_security'],
    description:
      'Public Freddie Mac capital-markets search path for debt securities, CUSIP/ISIN lookup, and security-level review.',
    officialUrl: 'https://capitalmarkets.freddiemac.com/debt',
  },
  {
    key: 'freddie_mac_clarity',
    label: 'Freddie Mac Clarity',
    category: 'registry',
    searchPosture: 'client_portal',
    supportedIdentifierTypes: ['cusip', 'pool_number', 'pool_reference', 'issuer_name'],
    supportedRecordKinds: ['reserve_security', 'corporate_note', 'serviced_contract', 'general_security'],
    description:
      'Freddie Mac MBS and CRT disclosure/data-intelligence path for issuance, portfolio, and historical performance review.',
    officialUrl: 'https://capitalmarkets.freddiemac.com/clarity',
  },
  {
    key: 'fannie_mae_debt',
    label: 'Fannie Mae Debt Search',
    category: 'registry',
    searchPosture: 'public_search',
    supportedIdentifierTypes: ['cusip', 'issuer_name', 'pool_reference', 'statement_number'],
    supportedRecordKinds: ['reserve_security', 'corporate_note', 'serviced_contract', 'general_security'],
    description:
      'Public Fannie Mae debt-document path for CUSIP-backed pricing supplements, outstanding debt reports, and strip references.',
    officialUrl:
      'https://capitalmarkets.fanniemae.com/debt-securities/debt-disclosure-documents/document-search',
  },
  {
    key: 'mers_servicerid',
    label: 'MERS ServicerID',
    category: 'registry',
    searchPosture: 'client_portal',
    supportedIdentifierTypes: ['min_number', 'account_number', 'issuer_name'],
    supportedRecordKinds: ['serviced_contract', 'corporate_note', 'general_security'],
    description:
      'Authorized-user lookup path for mortgage servicer and investor identification using MIN, borrower, or property-linked servicing references.',
    officialUrl: 'https://www.mersinc.org/homeowners/mers-servicerid',
  },
  {
    key: 'mers_eregistry',
    label: 'MERS eRegistry',
    category: 'registry',
    searchPosture: 'client_portal',
    supportedIdentifierTypes: ['min_number', 'contract_number', 'pool_reference', 'issuer_name'],
    supportedRecordKinds: ['serviced_contract', 'corporate_note', 'reserve_security', 'general_security'],
    description:
      'Participant registry for eNotes, controller/location status, authoritative-copy control, and eMortgage transfer tracing.',
    officialUrl: 'https://www.mersinc.org/products-services/mers-esuite/eregistry',
  },
  {
    key: 'fedwire_securities',
    label: 'Fedwire Securities Service',
    category: 'depository',
    searchPosture: 'client_portal',
    supportedIdentifierTypes: ['cusip', 'issuer_name', 'pool_reference', 'book_entry_identifier'],
    supportedRecordKinds: ['reserve_security', 'municipal_bond', 'corporate_note', 'general_security'],
    description:
      'Federal Reserve book-entry securities settlement path for Treasury, agency, GSE, and other eligible securities transferred free or against payment.',
    officialUrl: 'https://www.frbservices.org/financial-services/securities/',
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
    key: 'physical_custody',
    label: 'Physical Certificate / Held Instrument',
    category: 'manual',
    searchPosture: 'manual_only',
    supportedIdentifierTypes: [
      'certificate_number',
      'book_entry_identifier',
      'recording_number',
      'issuer_name',
      'contract_number',
    ],
    supportedRecordKinds: [
      'reserve_security',
      'municipal_bond',
      'corporate_note',
      'serviced_contract',
      'general_security',
    ],
    description:
      'Fallback for paper certificates, wet-ink notes, or other physically held instruments proved by uploaded photo or scan when no searchable registry match is available.',
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

function detectMortgageText(text: string) {
  return (
    text.includes('mortgage') ||
    text.includes('servicer') ||
    text.includes('deed of trust') ||
    text.includes('enote') ||
    text.includes('m.e.r.s') ||
    text.includes('mers') ||
    text.includes('pool id') ||
    text.includes('pool number') ||
    text.includes('remic') ||
    text.includes('fha') ||
    text.includes('va ') ||
    text.includes('usda') ||
    text.includes('ginnie') ||
    text.includes('gnma') ||
    text.includes('fannie') ||
    text.includes('fnma') ||
    text.includes('freddie') ||
    text.includes('fhlmc')
  );
}

function detectTreasuryText(text: string) {
  return (
    text.includes('treasury') ||
    text.includes('t-bill') ||
    text.includes('t bill') ||
    text.includes('t-note') ||
    text.includes('t note') ||
    text.includes('t-bond') ||
    text.includes('t bond') ||
    text.includes('tips') ||
    text.includes('frn')
  );
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

  const mortgageContext = detectMortgageText(text);
  const treasuryContext = detectTreasuryText(text);
  const ginnieContext =
    text.includes('ginnie') || text.includes('gnma') || text.includes('fha') || text.includes('usda');
  const freddieContext = text.includes('freddie') || text.includes('fhlmc');
  const fannieContext = text.includes('fannie') || text.includes('fnma');

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
      'finra_trace',
      'TRACE can help validate corporate, agency, 144A, and structured-product security references tied to statement-backed obligations.',
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
      'pacer_case_locator',
      'Federal docket or case-locator tracing may be needed when the obligation ties into a U.S. court filing or case number.',
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
      'finra_trace',
      'Fixed-income trade and security lookup is useful when the note or contract points into corporate, agency, or structured debt paper.',
    );
    addSuggestion(
      'sec_edgar',
      'Corporate or serviced-contract posture can benefit from issuer filing and securitized-contract evidence review.',
    );
  }

  if (mortgageContext) {
    addSuggestion(
      'mers_servicerid',
      'Mortgage or servicing language was detected, so servicer and investor lookup should be available through MERS-linked identifiers.',
    );
    addSuggestion(
      'mers_eregistry',
      'eNote, MIN, or control-chain tracing belongs in the MERS eRegistry path when the contract should resolve to an authoritative-copy holder.',
    );
  }

  if (ginnieContext) {
    addSuggestion(
      'ginnie_mae_disclosure',
      'Government-insured mortgage language suggests a Ginnie Mae disclosure or pool search may identify the related security or collateral chain.',
    );
  }

  if (freddieContext || mortgageContext) {
    addSuggestion(
      'freddie_mac_clarity',
      'Mortgage pool or CRT-style context suggests a Freddie Mac MBS disclosure and performance search path.',
    );
    addSuggestion(
      'freddie_mac_debt',
      'Freddie Mac debt and security lookup can help connect contract references back to a public CUSIP or security record.',
    );
  }

  if (fannieContext || mortgageContext) {
    addSuggestion(
      'fannie_mae_debt',
      'Fannie Mae public debt and document search can help tie the obligation to a CUSIP-backed security or strip reference.',
    );
  }

  if (treasuryContext) {
    addSuggestion(
      'treasury_fiscal_data',
      'Treasury-language signals a good fit for public CUSIP, auction, and issue reference data from Fiscal Data.',
    );
    addSuggestion(
      'fedwire_securities',
      'Treasury and eligible agency securities ultimately settle through Fedwire Securities, so the book-entry settlement path belongs in the trace stack.',
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

  return suggestions.slice(0, 8);
}
