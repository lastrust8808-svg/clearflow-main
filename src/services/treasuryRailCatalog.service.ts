export interface TreasuryRailDefinition {
  railKey:
    | 'commercial_ach'
    | 'same_day_ach'
    | 'fedwire'
    | 'fednow'
    | 'rtp'
    | 'bank_bill_pay'
    | 'biller_direct'
    | 'nacha_file'
    | 'internal_ledger';
  label: string;
  settlementWindow: string;
  readiness: 'live_now' | 'bank_dependent' | 'staged';
  bestUse: string;
  notes: string;
}

const treasuryRailCatalog: TreasuryRailDefinition[] = [
  {
    railKey: 'commercial_ach',
    label: 'Commercial ACH',
    settlementWindow: '1-3 banking days',
    readiness: 'live_now',
    bestUse: 'standard vendor disbursements, payroll-style bank settlement, and recurring ERP cashflow',
    notes:
      'Best for broad compatibility. Requires verified payee instructions and a real origination provider or bank channel; Nacha membership is a governance and education path, not origination authority by itself.',
  },
  {
    railKey: 'same_day_ach',
    label: 'Same Day ACH',
    settlementWindow: 'same banking day',
    readiness: 'bank_dependent',
    bestUse: 'faster vendor settlement where same-day windows are available',
    notes:
      'Availability depends on bank/provider cutoff windows and enabled same-day origination support.',
  },
  {
    railKey: 'fedwire',
    label: 'Fedwire Funds',
    settlementWindow: 'real-time final settlement',
    readiness: 'bank_dependent',
    bestUse: 'high-value or time-critical payments needing finality',
    notes:
      'Institutional rail. Requires bank/provider support and stronger release controls than standard ACH.',
  },
  {
    railKey: 'fednow',
    label: 'FedNow',
    settlementWindow: 'seconds',
    readiness: 'bank_dependent',
    bestUse: 'instant account-to-account settlement where the sending and receiving institutions participate',
    notes:
      'Bank participation is required. Treat as institution-dependent unless your execution provider exposes it directly.',
  },
  {
    railKey: 'rtp',
    label: 'RTP Network',
    settlementWindow: 'seconds',
    readiness: 'bank_dependent',
    bestUse: 'real-time business payments and rapid confirmation flows',
    notes:
      'Requires participating institutions and a provider that can originate or receive RTP messages.',
  },
  {
    railKey: 'bank_bill_pay',
    label: 'Bank Bill Pay',
    settlementWindow: 'varies by bank and biller',
    readiness: 'bank_dependent',
    bestUse: 'utilities, servicers, and biller-direct remittance where a generic ACH vendor payout does not fit',
    notes:
      'Good bridge rail for DTE-style payees until a dedicated biller-direct connector exists.',
  },
  {
    railKey: 'biller_direct',
    label: 'Biller-Direct',
    settlementWindow: 'varies by biller',
    readiness: 'staged',
    bestUse: 'utility, lockbox, and coupon-based remittance application',
    notes:
      'Should be treated separately from ordinary bank payees. Requires biller-specific or aggregator support.',
  },
  {
    railKey: 'nacha_file',
    label: 'NACHA File Origination',
    settlementWindow: 'bank processing window dependent',
    readiness: 'bank_dependent',
    bestUse: 'institution-controlled ACH origination with file approval and treasury operations',
    notes:
      'Useful for treasury desks and banks that prefer ACH file upload over direct API origination. Pair with Nacha Operating Rules review and bank/ODFI approval before live release.',
  },
  {
    railKey: 'internal_ledger',
    label: 'Internal Ledger',
    settlementWindow: 'immediate internal control',
    readiness: 'live_now',
    bestUse: 'pre-release staging, reserve-backed settlements, and internal controlled book entry',
    notes:
      'This is not an external payment rail by itself. It should feed an external rail or remain explicitly internal-only.',
  },
];

export function getTreasuryRailCatalog() {
  return treasuryRailCatalog;
}
