import type { EntityRecord, LedgerAccountRecord } from '../types/core';

export type MercuryAccountSubType =
  | 'currentAssets'
  | 'nonCurrentAssets'
  | 'transfersBetweenAccounts'
  | 'currentLiabilities'
  | 'nonCurrentLiabilities'
  | 'equity'
  | 'retainedEarnings'
  | 'operatingRevenues'
  | 'costOfGoodsSold'
  | 'operatingExpenses'
  | 'otherIncome'
  | 'otherExpenses';

export interface MercuryCompatibleAccountTemplate {
  code: string;
  name: string;
  accountType: LedgerAccountRecord['accountType'];
  accountSubType: MercuryAccountSubType;
  normalBalance: 'debit' | 'credit';
  mercurySortCode?: string;
  mercuryCanonicalName?: string;
  parentMercurySortCode?: string;
  mappingStatus: 'matched' | 'clearflow_extension';
  remittanceClassification?: LedgerAccountRecord['remittanceClassification'];
  legacyCodes?: string[];
  legacyNames?: string[];
}

const mercury = (
  sortCode: string,
  name: string,
  accountType: LedgerAccountRecord['accountType'],
  accountSubType: MercuryAccountSubType,
  normalBalance: 'debit' | 'credit',
  options: Partial<MercuryCompatibleAccountTemplate> = {},
): MercuryCompatibleAccountTemplate => ({
  code: sortCode,
  name,
  accountType,
  accountSubType,
  normalBalance,
  mercurySortCode: sortCode,
  mercuryCanonicalName: name,
  mappingStatus: 'matched',
  ...options,
});

const extension = (
  code: string,
  name: string,
  accountType: LedgerAccountRecord['accountType'],
  accountSubType: MercuryAccountSubType,
  normalBalance: 'debit' | 'credit',
  options: Partial<MercuryCompatibleAccountTemplate> = {},
): MercuryCompatibleAccountTemplate => ({
  code,
  name,
  accountType,
  accountSubType,
  normalBalance,
  mappingStatus: 'clearflow_extension',
  ...options,
});

/**
 * Canonical business chart used by ClearFlow.
 *
 * Mercury Books is the naming/type/sort-code authority for matched accounts.
 * ClearFlow-only control accounts are retained as explicit extensions instead of
 * being forced into a Mercury category that means something different.
 *
 * Mercury ledger IDs are intentionally NOT hard-coded here because they are
 * organization-specific. A connected entity may persist its current ledger ID
 * in LedgerAccountRecord.mercuryLedgerId after runtime matching.
 */
export const mercuryCompatibleBusinessChart: MercuryCompatibleAccountTemplate[] = [
  mercury('10000', 'Cash and Cash Equivalents', 'asset', 'currentAssets', 'debit', {
    legacyCodes: ['1000'],
    legacyNames: ['Operating Cash'],
    remittanceClassification: 'cash',
  }),
  mercury('10100', 'Petty Cash', 'asset', 'currentAssets', 'debit', {
    remittanceClassification: 'cash',
  }),
  mercury('10300', 'Savings and Treasury Accounts', 'asset', 'currentAssets', 'debit', {
    remittanceClassification: 'reserve',
  }),
  mercury('10400', 'Payment Processor Balances', 'asset', 'currentAssets', 'debit', {
    remittanceClassification: 'cash',
  }),
  mercury('10600', 'Undeposited Funds', 'asset', 'currentAssets', 'debit', {
    remittanceClassification: 'cash',
  }),
  mercury('14100', 'Inventory', 'asset', 'currentAssets', 'debit'),
  mercury('14400', 'Short-Term Investments', 'asset', 'currentAssets', 'debit', {
    remittanceClassification: 'reserve',
  }),
  mercury('15000', 'Other Current Assets', 'asset', 'currentAssets', 'debit'),
  mercury('18000', 'Other Non-Current Assets', 'asset', 'nonCurrentAssets', 'debit'),
  mercury('19000', 'Transfers Between Accounts', 'asset', 'transfersBetweenAccounts', 'debit'),

  extension('1100', 'Accounts Receivable', 'asset', 'currentAssets', 'debit', {
    remittanceClassification: 'receivable',
  }),
  extension('1150', 'Digital Asset Holdings', 'asset', 'currentAssets', 'debit', {
    remittanceClassification: 'reserve',
  }),
  extension('1300', 'Private Notes Receivable', 'asset', 'nonCurrentAssets', 'debit', {
    remittanceClassification: 'receivable',
  }),
  extension('1450', 'Intercompany Receivable', 'asset', 'currentAssets', 'debit', {
    remittanceClassification: 'receivable',
  }),

  mercury('21000', 'Credit Cards Payable', 'liability', 'currentLiabilities', 'credit'),
  mercury('24150', 'Wages Payable', 'liability', 'currentLiabilities', 'credit'),
  mercury('24200', 'Sales Taxes Payable', 'liability', 'currentLiabilities', 'credit'),
  mercury('24400', 'Payroll Taxes Payable', 'liability', 'currentLiabilities', 'credit'),
  mercury('24500', 'Short Term Debt', 'liability', 'currentLiabilities', 'credit'),
  mercury('24900', 'Other Current Liabilities', 'liability', 'currentLiabilities', 'credit'),
  mercury('24990', 'Payroll Clearing', 'liability', 'currentLiabilities', 'credit'),
  mercury('27050', 'Long Term Debt', 'liability', 'nonCurrentLiabilities', 'credit'),
  mercury('27900', 'Other Non-Current Liabilities', 'liability', 'nonCurrentLiabilities', 'credit'),

  extension('2000', 'Accounts Payable', 'liability', 'currentLiabilities', 'credit', {
    remittanceClassification: 'obligation',
  }),
  extension('2105', 'Remittance Obligations Clearing', 'liability', 'currentLiabilities', 'credit', {
    remittanceClassification: 'obligation',
  }),
  extension('2300', 'Unapplied Cash', 'liability', 'currentLiabilities', 'credit', {
    remittanceClassification: 'obligation',
  }),
  extension('2405', 'Digital Asset Clearing', 'liability', 'currentLiabilities', 'credit', {
    remittanceClassification: 'obligation',
  }),

  mercury('32200', 'Owner, Partner, or Member Contributions', 'equity', 'equity', 'credit'),
  mercury('32300', 'Owner, Partner, or Member Draws', 'equity', 'equity', 'debit', {
    legacyNames: ['Owner Pay', 'Owner Draw', 'Owner Draws'],
  }),
  mercury('32400', 'Owner, Partner, or Member Capital', 'equity', 'equity', 'credit'),
  mercury('80100', 'Opening Balance Retained Earnings', 'equity', 'retainedEarnings', 'credit'),
  mercury('80200', 'Retained Earnings', 'equity', 'retainedEarnings', 'credit'),
  mercury('80300', 'Current Year Earnings', 'equity', 'retainedEarnings', 'credit'),

  mercury('41000', 'Sales Revenue', 'income', 'operatingRevenues', 'credit'),
  mercury('41200', 'Services Revenue', 'income', 'operatingRevenues', 'credit', {
    legacyCodes: ['4000'],
    legacyNames: ['Service Revenue'],
  }),
  mercury('41900', 'Other Revenue', 'income', 'operatingRevenues', 'credit'),
  mercury('43100', 'Interest Income', 'income', 'otherIncome', 'credit'),
  mercury('43520', 'Credit Card Rewards and Cashback', 'income', 'otherIncome', 'credit'),
  mercury('43600', 'Uncategorized Cash Inflow', 'income', 'otherIncome', 'credit'),

  mercury('51000', 'Cost of Revenue', 'expense', 'costOfGoodsSold', 'debit'),
  mercury('51100', 'Cost of Revenue: Inventory', 'expense', 'costOfGoodsSold', 'debit', {
    parentMercurySortCode: '51000',
    legacyNames: ['Materials', 'Job Materials', 'Direct Materials'],
  }),
  mercury('51400', 'Cost of Revenue: Payment Processing Fees', 'expense', 'costOfGoodsSold', 'debit', {
    parentMercurySortCode: '51000',
  }),
  mercury('51500', 'Cost of Revenue: Shipping and Fulfillment', 'expense', 'costOfGoodsSold', 'debit', {
    parentMercurySortCode: '51000',
  }),
  mercury('51600', 'Cost of Revenue: Contractors', 'expense', 'costOfGoodsSold', 'debit', {
    parentMercurySortCode: '51000',
    legacyNames: ['Helper Pay', 'Direct Labor', 'Job Labor'],
  }),
  mercury('51900', 'Cost of Revenue: Other', 'expense', 'costOfGoodsSold', 'debit', {
    parentMercurySortCode: '51000',
  }),

  mercury('53010', 'Salaries and Wages', 'expense', 'operatingExpenses', 'debit'),
  mercury('53180', 'Contractors and Consultants', 'expense', 'operatingExpenses', 'debit'),
  mercury('53400', 'Payroll Taxes', 'expense', 'operatingExpenses', 'debit'),
  mercury('53550', 'Other Employee Costs', 'expense', 'operatingExpenses', 'debit'),
  mercury('53910', 'Rent', 'expense', 'operatingExpenses', 'debit'),
  mercury('53930', 'Utilities, Phone, and Internet', 'expense', 'operatingExpenses', 'debit'),
  mercury('53950', 'Repairs and Maintenance', 'expense', 'operatingExpenses', 'debit'),
  mercury('54020', 'Software and Subscriptions', 'expense', 'operatingExpenses', 'debit'),
  mercury('54800', 'Insurance', 'expense', 'operatingExpenses', 'debit', {
    legacyCodes: ['6100'],
    legacyNames: ['Insurance Expense'],
  }),
  mercury('55000', 'Professional Services', 'expense', 'operatingExpenses', 'debit'),
  mercury('55390', 'Gas and Auto', 'expense', 'operatingExpenses', 'debit'),
  mercury('55400', 'Travel', 'expense', 'operatingExpenses', 'debit'),
  mercury('55470', 'Travel Meals', 'expense', 'operatingExpenses', 'debit', {
    parentMercurySortCode: '55400',
  }),
  mercury('55500', 'Meals', 'expense', 'operatingExpenses', 'debit'),
  mercury('55600', 'Entertainment', 'expense', 'operatingExpenses', 'debit'),
  mercury('55620', 'Office Supplies', 'expense', 'operatingExpenses', 'debit'),
  mercury('55640', 'Equipment and Small Tools', 'expense', 'operatingExpenses', 'debit'),
  mercury('55660', 'Shipping and Postage', 'expense', 'operatingExpenses', 'debit'),
  mercury('55680', 'Bank Fees', 'expense', 'operatingExpenses', 'debit'),
  mercury('55800', 'Taxes and Licenses', 'expense', 'operatingExpenses', 'debit'),
  mercury('56000', 'Penalties and Settlements', 'expense', 'operatingExpenses', 'debit'),
  mercury('56900', 'Other Operating Expenses', 'expense', 'operatingExpenses', 'debit'),
  mercury('59900', 'Uncategorized Cash Outflow', 'expense', 'otherExpenses', 'debit'),

  extension('6105', 'Digital Asset Disbursements', 'expense', 'operatingExpenses', 'debit'),
  extension('6850', 'Network Fees', 'expense', 'operatingExpenses', 'debit'),
];

const businessEntityTypes = new Set<EntityRecord['type']>([
  'llc',
  'corporation',
  'partnership',
  'nonprofit',
]);

const normalize = (value?: string) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const isMercuryCompatibleBusinessEntity = (entity?: EntityRecord | null) =>
  Boolean(entity && businessEntityTypes.has(entity.type));

const findTemplateMatch = (
  account: LedgerAccountRecord,
  template: MercuryCompatibleAccountTemplate,
) => {
  if (template.mercurySortCode && account.mercurySortCode === template.mercurySortCode) {
    return true;
  }

  if (template.mercuryCanonicalName && normalize(account.mercuryCanonicalName) === normalize(template.mercuryCanonicalName)) {
    return true;
  }

  if (normalize(account.name) === normalize(template.name)) {
    return true;
  }

  if (template.legacyCodes?.includes(account.code)) {
    return true;
  }

  return Boolean(template.legacyNames?.some((name) => normalize(name) === normalize(account.name)));
};

const applyTemplate = (
  account: LedgerAccountRecord,
  template: MercuryCompatibleAccountTemplate,
): LedgerAccountRecord => {
  const shouldCanonicalize = template.mappingStatus === 'matched';

  return {
    ...account,
    code: shouldCanonicalize ? template.code : account.code,
    name: shouldCanonicalize ? template.name : account.name,
    accountType: template.accountType,
    accountSubType: template.accountSubType,
    normalBalance: template.normalBalance,
    mercurySortCode: template.mercurySortCode,
    mercuryCanonicalName: template.mercuryCanonicalName,
    parentMercurySortCode: template.parentMercurySortCode,
    mappingStatus: template.mappingStatus,
    remittanceClassification:
      account.remittanceClassification ?? template.remittanceClassification,
  };
};

const hasMeaningfulDifference = (left: LedgerAccountRecord, right: LedgerAccountRecord) =>
  left.code !== right.code ||
  left.name !== right.name ||
  left.accountType !== right.accountType ||
  left.accountSubType !== right.accountSubType ||
  left.normalBalance !== right.normalBalance ||
  left.mercurySortCode !== right.mercurySortCode ||
  left.mercuryCanonicalName !== right.mercuryCanonicalName ||
  left.parentMercurySortCode !== right.parentMercurySortCode ||
  left.mappingStatus !== right.mappingStatus ||
  left.remittanceClassification !== right.remittanceClassification;

/**
 * Adds the Mercury-compatible business chart to one entity and enriches legacy
 * ClearFlow accounts with stable crosswalk metadata. Existing balances and IDs
 * are preserved. The original array is returned when nothing changes so callers
 * may safely use this inside a React state migration effect.
 */
export const ensureMercuryCompatibleChartOfAccounts = (
  accounts: LedgerAccountRecord[] | undefined,
  entityId: string,
): LedgerAccountRecord[] => {
  const current = accounts ?? [];
  let changed = false;
  let next = [...current];

  for (const template of mercuryCompatibleBusinessChart) {
    const matchIndex = next.findIndex(
      (account) => account.entityId === entityId && findTemplateMatch(account, template),
    );

    if (matchIndex >= 0) {
      const existing = next[matchIndex];
      const enriched = applyTemplate(existing, template);
      if (hasMeaningfulDifference(existing, enriched)) {
        next[matchIndex] = enriched;
        changed = true;
      }
      continue;
    }

    next.push({
      id: `coa-${entityId}-${template.code}`,
      entityId,
      code: template.code,
      name: template.name,
      accountType: template.accountType,
      accountSubType: template.accountSubType,
      normalBalance: template.normalBalance,
      currency: 'USD',
      balance: 0,
      remittanceEligible: Boolean(template.remittanceClassification),
      remittanceClassification: template.remittanceClassification,
      mercurySortCode: template.mercurySortCode,
      mercuryCanonicalName: template.mercuryCanonicalName,
      parentMercurySortCode: template.parentMercurySortCode,
      mappingStatus: template.mappingStatus,
    });
    changed = true;
  }

  return changed ? next : current;
};
