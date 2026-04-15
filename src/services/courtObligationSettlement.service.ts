import type { FinancialConnectionProvider, ObligationRecord } from '../types/core';

export interface CourtObligationAccrualView {
  obligationId: string;
  title: string;
  jurisdiction: string;
  caseReference: string;
  amount: number;
  debitAccountCode: string;
  creditAccountCode: string;
  docketControl: 'source_document_only' | 'receivable_claim' | 'pledged_or_bonded_claim';
  settlementProvider?: FinancialConnectionProvider;
  acceptanceStatus: NonNullable<ObligationRecord['courtAdministration']>['acceptanceStatus'];
  canClearPayable: boolean;
  requiredProof: string[];
  controlNote: string;
}

const courtPaymentProviders: FinancialConnectionProvider[] = [
  'tyler_payments',
  'tyler_odyssey_file_serve',
  'payit',
  'catalis_court_payments',
  'journal_epay_it',
  'imagesoft_truefiling',
  'lexisnexis_government_payments',
  'gov_pay',
];

export function isCourtPaymentProvider(provider?: FinancialConnectionProvider) {
  return !!provider && courtPaymentProviders.includes(provider);
}

export function buildCourtObligationAccrualView(obligation: ObligationRecord): CourtObligationAccrualView | null {
  if (!obligation.courtAdministration) {
    return null;
  }

  const court = obligation.courtAdministration;
  const acceptanceStatus = court.acceptanceStatus || 'not_submitted';
  const hasProviderConfirmation = !!court.providerConfirmationNumber;
  const hasCourtReceipt = !!court.courtReceiptDocumentId;
  const providerIsCourtRail = isCourtPaymentProvider(court.acceptedSettlementProvider);
  const canClearPayable =
    acceptanceStatus === 'accepted_by_court' && hasProviderConfirmation && hasCourtReceipt && providerIsCourtRail;

  const caseReference = court.docketNumber || court.caseNumber || obligation.legalIdentifier || 'Unassigned docket';
  const docketControl = court.docketAssetRecognition || 'source_document_only';

  return {
    obligationId: obligation.id,
    title: obligation.title,
    jurisdiction: court.jurisdiction || court.courtName || 'Unassigned jurisdiction',
    caseReference,
    amount: obligation.amount,
    debitAccountCode: court.accrualRecognition === 'disputed_claim_review' ? '1290' : '6100',
    creditAccountCode: '2100',
    docketControl,
    settlementProvider: court.acceptedSettlementProvider,
    acceptanceStatus,
    canClearPayable,
    requiredProof: [
      providerIsCourtRail ? '' : 'Select a court or government payment provider profile.',
      hasProviderConfirmation ? '' : 'Capture the court/provider confirmation number.',
      hasCourtReceipt ? '' : 'Attach the accepted court receipt or filing payment proof.',
      acceptanceStatus === 'accepted_by_court' ? '' : 'Confirm the court accepted or posted the payment.',
    ].filter(Boolean),
    controlNote:
      'Accrue the court charge from the docket/case source document, then clear the payable only after a recognized court or government payment rail returns accepted confirmation and retained proof.',
  };
}

export function buildCourtObligationAccrualViews(obligations: ObligationRecord[]) {
  return obligations
    .map((obligation) => buildCourtObligationAccrualView(obligation))
    .filter((item): item is CourtObligationAccrualView => !!item);
}

