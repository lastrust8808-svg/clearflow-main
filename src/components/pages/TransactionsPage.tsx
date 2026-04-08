import type { Dispatch, SetStateAction } from 'react';
import type { AutoReconcileStatus, CoreDataBundle } from '../../types/core';
import { buildSettlementFlowViews, formatMoney } from '../../services/settlementAnalytics.service';
import {
  buildObligationLifecycleSummaries,
  type ObligationLifecycleSummary,
} from '../../services/obligationLifecycle.service';
import { buildTransactionProofChainViews } from '../../services/transactionProofChain.service';
import { buildDispatchFooter } from '../../services/dispatchIdentity.service';
import { buildBondLifecycleViews } from '../../services/bondLifecycle.service';
import PageSection from '../ui/PageSection';
import RecordCard from '../ui/RecordCard';
import RecordEditorCard from '../ui/RecordEditorCard';
import StatCard from '../ui/StatCard';

const paymentDraftStorageKey = 'clearflow-accounting-payment-draft';
const presentmentDraftStorageKey = 'clearflow-accounting-presentment-draft';

interface TransactionsPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

function goToHash(hash: string) {
  if (typeof window !== 'undefined') {
    window.location.hash = hash;
  }
}

function storeSessionDraft<T>(key: string, value: T) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(key, JSON.stringify(value));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToIsoDate(date: string, days: number) {
  const base = new Date(`${date}T00:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function dispatchTone(status: CoreDataBundle['dispatchRecords'][number]['status']) {
  switch (status) {
    case 'accepted':
      return 'teal';
    case 'dishonored':
      return 'rose';
    case 'response_received':
    case 'delivered':
      return 'gold';
    default:
      return 'blue';
  }
}

function acceptanceTone(status: CoreDataBundle['dispatchRecords'][number]['acceptanceStatus']) {
  switch (status) {
    case 'accepted':
      return 'teal';
    case 'dishonored':
      return 'rose';
    case 'conditional':
      return 'gold';
    default:
      return 'blue';
  }
}

function dispatchMethodLabel(method: CoreDataBundle['dispatchRecords'][number]['method']) {
  switch (method) {
    case 'internal_clearflow':
      return 'Internal ClearFlow';
    case 'postal_mail':
      return 'Postal dispatch';
    case 'email':
      return 'Email';
    case 'manual_upload':
      return 'Manual upload';
    case 'external_courier':
      return 'Courier';
    default:
      return method;
  }
}

function originalControlTone(
  status: CoreDataBundle['dispatchRecords'][number]['originalControlStatus']
) {
  switch (status) {
    case 'returned_original_received':
      return 'teal';
    case 'executed_copy_only':
      return 'gold';
    default:
      return 'blue';
  }
}

function serviceEvidenceTone(
  status: CoreDataBundle['dispatchRecords'][number]['serviceEvidenceStatus']
) {
  switch (status) {
    case 'executed_return_retained':
      return 'teal';
    case 'delivery_receipt_retained':
      return 'gold';
    case 'mailing_prepared':
      return 'blue';
    default:
      return 'rose';
  }
}

function counselTone(
  status: CoreDataBundle['dispatchRecords'][number]['counselReviewStatus']
) {
  switch (status) {
    case 'completed':
      return 'teal';
    case 'recommended':
      return 'gold';
    default:
      return 'blue';
  }
}

function statusPill(label: string, tone: 'blue' | 'teal' | 'gold' | 'rose') {
  const tones = {
    blue: {
      background: 'rgba(88, 141, 255, 0.18)',
      border: 'rgba(125, 163, 255, 0.24)',
      color: '#d9e6ff',
    },
    teal: {
      background: 'rgba(54, 215, 255, 0.18)',
      border: 'rgba(126, 242, 255, 0.24)',
      color: '#ddfbff',
    },
    gold: {
      background: 'rgba(247, 211, 123, 0.14)',
      border: 'rgba(247, 211, 123, 0.26)',
      color: '#fff2cc',
    },
    rose: {
      background: 'rgba(255, 120, 160, 0.18)',
      border: 'rgba(255, 160, 195, 0.24)',
      color: '#ffe1eb',
    },
  } satisfies Record<string, { background: string; border: string; color: string }>;

  const toneStyle = tones[tone];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '6px 10px',
        borderRadius: 999,
        border: `1px solid ${toneStyle.border}`,
        background: toneStyle.background,
        color: toneStyle.color,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.2,
      }}
    >
      {label}
    </span>
  );
}

function autoStatusTone(status: AutoReconcileStatus) {
  switch (status) {
    case 'matched':
      return 'teal';
    case 'partial':
      return 'gold';
    case 'exception':
      return 'rose';
    default:
      return 'blue';
  }
}

function settlementTone(status?: CoreDataBundle['settlements'][number]['status']) {
  switch (status) {
    case 'settled':
      return 'teal';
    case 'exception':
      return 'rose';
    case 'verifying':
    case 'clearing':
      return 'gold';
    default:
      return 'blue';
  }
}

function queueAccountingDraft(key: string, draft: Record<string, unknown>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(key, JSON.stringify(draft));
}

function resolveProofChainAction(chain: ReturnType<typeof buildTransactionProofChainViews>[number]) {
  if (chain.watchReasons.includes('Missing settlement link')) {
    return {
      label: 'Create Presentment',
      hash: '#accounting:new-presentment',
      detail: 'Start the settlement trail by recording a coupon or remittance presentment.',
    };
  }

  if (chain.watchReasons.includes('No linked payments')) {
    return {
      label: 'Record Payment',
      hash: '#accounting:new-payment',
      detail: 'Tie this chain to a real payment so settlement and proof can continue.',
    };
  }

  if (chain.watchReasons.includes('No movement identifiers')) {
    return {
      label: 'Open Rails & Codes',
      hash: '#accounting:railOps',
      detail: 'Assign ACH, wire, or other movement identifiers to complete the chain.',
    };
  }

  if (
    chain.watchReasons.includes('No verification tokens') ||
    chain.watchReasons.includes('Settlement not verified')
  ) {
    return {
      label: 'Open Payments Desk',
      hash: '#accounting:payments',
      detail: 'Finish verification and token proof coverage on the linked settlement.',
    };
  }

  return {
    label: 'Open Settlement Trail',
    hash: chain.settlementId ? '#accounting:payments' : '#transactions',
    detail: 'Review the linked settlement, payment, and proof chain from the transactions desk.',
  };
}

export default function TransactionsPage({ data, setData }: TransactionsPageProps) {
  const settlementFlows = buildSettlementFlowViews(data);
  const transactionById = new Map(data.transactions.map((transaction) => [transaction.id, transaction]));
  const settlementById = new Map(data.settlements.map((settlement) => [settlement.id, settlement]));
  const remittanceById = new Map(
    data.remittanceStatements.map((statement) => [statement.id, statement])
  );
  const entityById = new Map(data.entities.map((entity) => [entity.id, entity]));
  const connectionById = new Map(
    data.entityConnections.map((connection) => [connection.id, connection])
  );
  const entityNameById = new Map(data.entities.map((entity) => [entity.id, entity.name]));
  const coveredTransactions = settlementFlows.filter((flow) => flow.settlement).length;
  const liquidCashReadyCount = settlementFlows.filter((flow) => flow.liquidCashReady).length;
  const verifiedCount = settlementFlows.filter((flow) => flow.verificationReady).length;
  const autoMatchedCount = settlementFlows.filter(
    (flow) => flow.derivedAutoReconcileStatus === 'matched'
  ).length;
  const interEntityMoveCount = data.interEntityTransfers.length * 2;
  const registerCount = data.negotiableInstrumentRegisters.length;
  const holderLedgerCount = data.holderLedgerEntries.length;
  const exceptionCount = settlementFlows.filter(
    (flow) =>
      flow.hasCoverageGap ||
      flow.derivedAutoReconcileStatus === 'exception' ||
      flow.settlement?.status === 'exception'
  ).length;
  const obligationLifecycleSummaries = buildObligationLifecycleSummaries(data);
  const transactionProofChains = buildTransactionProofChainViews(data);
  const bondLifecycleViews = buildBondLifecycleViews(data);
  const defaultedObligationCount = obligationLifecycleSummaries.filter(
    (item) => item.stage === 'defaulted'
  ).length;
  const dischargedObligationCount = obligationLifecycleSummaries.filter(
    (item) => item.stage === 'discharged'
  ).length;
  const sealedProofChainCount = transactionProofChains.filter(
    (item) => item.verificationStatus === 'sealed'
  ).length;
  const billOfExchangeFlows = data.instruments
    .filter((instrument) => instrument.instrumentType === 'bill_of_exchange')
    .map((instrument) => {
      const obligation = data.obligations.find((item) => item.linkedInstrumentIds?.includes(instrument.id));
      const register = data.negotiableInstrumentRegisters.find(
        (item) => item.instrumentId === instrument.id || item.obligationId === obligation?.id
      );
      const instrumentSettlement = data.instrumentSettlements.find(
        (item) => item.instrumentId === instrument.id || item.obligationId === obligation?.id
      );
      const presentments = data.couponPresentments
        .filter(
          (item) =>
            item.instrumentId === instrument.id ||
            item.obligationId === obligation?.id ||
            item.instrumentSettlementId === instrumentSettlement?.id
        )
        .sort((a, b) => b.presentmentDate.localeCompare(a.presentmentDate));
      const latestPresentment = presentments[0];
      const settlement =
        (latestPresentment?.linkedSettlementId
          ? settlementById.get(latestPresentment.linkedSettlementId)
          : undefined) ||
        (instrumentSettlement?.linkedSettlementId
          ? settlementById.get(instrumentSettlement.linkedSettlementId)
          : undefined) ||
        (obligation?.linkedSettlementIds?.[0]
          ? settlementById.get(obligation.linkedSettlementIds[0])
          : undefined);
      const remittance =
        (latestPresentment?.linkedRemittanceStatementId
          ? remittanceById.get(latestPresentment.linkedRemittanceStatementId)
          : undefined) ||
        (settlement?.linkedRemittanceStatementId
          ? remittanceById.get(settlement.linkedRemittanceStatementId)
          : undefined) ||
        (obligation?.linkedRemittanceStatementIds?.[0]
          ? remittanceById.get(obligation.linkedRemittanceStatementIds[0])
          : undefined);
      const holderConnection =
        (register?.currentHolderConnectionId
          ? connectionById.get(register.currentHolderConnectionId)
          : undefined) ||
        data.entityConnections.find(
          (item) =>
            item.ownerEntityId === instrument.entityId &&
            item.connectedEntityId === instrument.counterpartyEntityId
        );
      const dispatches = data.dispatchRecords
        .filter(
          (item) =>
            item.linkedInstrumentId === instrument.id ||
            item.linkedObligationId === obligation?.id ||
            item.subjectId === instrument.id ||
            item.subjectId === obligation?.id
        )
        .sort((a, b) => {
          const left = `${b.dispatchDate}|${b.deliveredAt || ''}|${b.respondedAt || ''}`;
          const right = `${a.dispatchDate}|${a.deliveredAt || ''}|${a.respondedAt || ''}`;
          return left.localeCompare(right);
        });
      const latestDispatch = dispatches[0];

      return {
        instrument,
        obligation,
        register,
        instrumentSettlement,
        presentments,
        latestPresentment,
        settlement,
        remittance,
        holderConnection,
        dispatches,
        latestDispatch,
        ownerEntity: entityById.get(instrument.entityId),
        packetId: instrument.linkedDocumentIds?.[0] || register?.linkedDocumentIds?.[0],
      };
    });
  const activeDispatchCount = billOfExchangeFlows.filter((flow) => flow.latestDispatch).length;
  const pendingAcceptanceDispatchCount = billOfExchangeFlows.filter(
    (flow) =>
      flow.latestDispatch &&
      !['accepted', 'dishonored'].includes(flow.latestDispatch.acceptanceStatus)
  ).length;

  const handleDispatchBillExchange = (
    flow: (typeof billOfExchangeFlows)[number],
    method: CoreDataBundle['dispatchRecords'][number]['method']
  ) => {
    const now = todayIso();
    const stamp = Date.now();
    const dispatchId = `dispatch-boe-${stamp}`;
    const dispatchDocumentId = `doc-boe-dispatch-${stamp}`;
    const dispatchTokenId = `tok-boe-dispatch-${stamp}`;
    const complianceTagId = `cmp-boe-dispatch-${stamp}`;
    const recipientLabel =
      flow.holderConnection?.connectionName ||
      flow.register?.currentHolderLabel ||
      flow.latestPresentment?.receiverName ||
      flow.instrument.counterpartyLabel ||
      'Outside drawee / holder';
    const recipientEntityId =
      flow.holderConnection?.connectedEntityId || flow.instrument.counterpartyEntityId;
    const recipientEmail = flow.holderConnection?.connectedUserEmail;
    const governingLawLabel =
      flow.ownerEntity?.jurisdiction || flow.ownerEntity?.country || 'Jurisdiction review required';
    const governingVenueLabel =
      flow.ownerEntity?.country || flow.ownerEntity?.jurisdiction || 'Venue review required';
    const dispatchFooter = buildDispatchFooter({
      mailingLine: flow.ownerEntity?.branding?.entityMailingLine,
      proofSealCode: flow.ownerEntity?.branding?.entityProofSealCode,
      qrPayload: flow.ownerEntity?.branding?.entityQrPayload,
    });
    const methodLabel = dispatchMethodLabel(method);

    setData((prev) => ({
      ...prev,
      dispatchRecords: [
        {
          id: dispatchId,
          entityId: flow.instrument.entityId,
          title: `Acceptance Dispatch - ${flow.instrument.title}`,
          subjectType: 'instrument',
          subjectId: flow.instrument.id,
          linkedInstrumentId: flow.instrument.id,
          linkedObligationId: flow.obligation?.id,
          linkedSettlementId: flow.settlement?.id,
          linkedRemittanceStatementId: flow.remittance?.id,
          recipientLabel,
          recipientEntityId,
          recipientConnectionId: flow.holderConnection?.id,
          recipientEmail,
          method,
          status: 'sent',
          acceptanceStatus: 'pending',
          originalControlStatus: 'issuer_controlled_original',
          serviceEvidenceStatus:
            method === 'postal_mail' || method === 'external_courier'
              ? 'mailing_prepared'
              : 'delivery_receipt_retained',
          counselReviewStatus:
            method === 'postal_mail' || method === 'external_courier' ? 'recommended' : 'not_started',
          dispatchDate: now,
          expectedResponseDate: addDaysToIsoDate(now, 7),
          protestDeadline: addDaysToIsoDate(now, 10),
          externalReference:
            method === 'postal_mail'
              ? flow.ownerEntity?.branding?.entityMailingLine
              : flow.holderConnection?.connectedWorkspaceLabel || recipientEmail,
          governingLawLabel,
          governingVenueLabel,
          mailingLine: flow.ownerEntity?.branding?.entityMailingLine,
          proofSealCode: flow.ownerEntity?.branding?.entityProofSealCode,
          qrPayload: flow.ownerEntity?.branding?.entityQrPayload,
          linkedDocumentIds: [dispatchDocumentId],
          linkedTokenIds: [dispatchTokenId],
          notes:
            method === 'postal_mail'
              ? 'Prepared for outside mailing or courier presentment with retained dispatch identity.'
              : 'Prepared for internal or electronic presentment through the connected ClearFlow counterparty path.',
          enforceabilityNotes:
            'Use actual delivery proof, returned evidence, governing-law review, and original-control records before treating the presentment as externally enforceable.',
        },
        ...prev.dispatchRecords,
      ],
      documents: [
        {
          id: dispatchDocumentId,
          entityId: flow.instrument.entityId,
          title: `Send For Acceptance - ${flow.instrument.title}`,
          category: 'legal_memo',
          date: now,
          status: 'final',
          outputStatus: 'ready',
          generatedBody: `SEND FOR ACCEPTANCE\n\nInstrument: ${flow.instrument.title}\nLegal Identifier: ${
            flow.instrument.legalIdentifier || 'Pending'
          }\nMethod: ${methodLabel}\nRecipient: ${recipientLabel}\nRecipient Email: ${
            recipientEmail || 'Not recorded'
          }\nDispatch Date: ${now}\nExpected Response Date: ${addDaysToIsoDate(
            now,
            7
          )}\nGoverning Law / Venue: ${governingLawLabel} / ${governingVenueLabel}\nOriginal Control: Issuer-controlled original pending returned evidence\nService Evidence: ${
            method === 'postal_mail' || method === 'external_courier'
              ? 'Mailing prepared; retain mailing receipt and returned copy.'
              : 'Electronic or internal delivery launched; retain delivery evidence.'
          }\nProtest / Escalation Review By: ${addDaysToIsoDate(
            now,
            10
          )}\n\nThis retained dispatch packet records controlled presentment for acceptance, outside-party response tracking, and proof posture. External legal effect still depends on actual delivery, governing law, original-control evidence, and the receiving party's conduct.${dispatchFooter}`,
          linkedInstrumentIds: [flow.instrument.id],
          linkedComplianceTagIds: [complianceTagId],
          linkedTokenIds: [dispatchTokenId],
          summary: `${methodLabel} acceptance packet prepared from the bill of exchange desk.`,
          storageOwner: 'clearflow_retained',
          retentionClass: 'security_support',
          externalStorageStatus: 'not_applicable',
        },
        ...prev.documents,
      ],
      tokens: [
        {
          id: dispatchTokenId,
          entityId: flow.instrument.entityId,
          subjectType: 'dispatch',
          subjectId: dispatchId,
          label: `Dispatch Proof Token - ${flow.instrument.legalIdentifier || flow.instrument.title}`,
          status: 'issued',
          issuedAt: new Date().toISOString(),
          proofReference:
            flow.ownerEntity?.branding?.entityProofSealCode ||
            flow.ownerEntity?.branding?.entityMailingLine ||
            dispatchId,
          notes: 'Retained to tie the original send-for-acceptance packet to the entity dispatch identity.',
        },
        ...prev.tokens,
      ],
      complianceTags: [
        {
          id: complianceTagId,
          entityId: flow.instrument.entityId,
          label: `Acceptance response pending - ${flow.instrument.legalIdentifier || flow.instrument.title}`,
          category: 'risk',
          status: 'review',
          dueDate: addDaysToIsoDate(now, 7),
          linkedDocumentIds: [dispatchDocumentId],
          notes:
            'Dispatch issued for acceptance. Track delivery, returned evidence, and any response before relying on dishonor, protest, or discharge posture.',
        },
        ...prev.complianceTags,
      ],
      negotiableInstrumentRegisters: prev.negotiableInstrumentRegisters.map((item) =>
        item.id === flow.register?.id
          ? {
              ...item,
              linkedDocumentIds: [...(item.linkedDocumentIds || []), dispatchDocumentId],
              linkedTokenIds: [...(item.linkedTokenIds || []), dispatchTokenId],
            }
          : item
      ),
    }));
  };

  const handlePrepareReturnEvidence = (
    flow: (typeof billOfExchangeFlows)[number],
    dispatchId?: string
  ) => {
    const now = todayIso();
    const evidenceDocumentId = `doc-boe-evidence-${Date.now()}`;
    const dispatchFooter = buildDispatchFooter({
      mailingLine: flow.ownerEntity?.branding?.entityMailingLine,
      proofSealCode: flow.ownerEntity?.branding?.entityProofSealCode,
      qrPayload: flow.ownerEntity?.branding?.entityQrPayload,
    });

    setData((prev) => ({
      ...prev,
      dispatchRecords: prev.dispatchRecords.map((item) =>
        item.id === dispatchId
          ? {
              ...item,
              status: item.status === 'accepted' || item.status === 'dishonored'
                ? item.status
                : 'response_received',
              returnedEvidenceDocumentId: evidenceDocumentId,
              serviceEvidenceStatus:
                item.serviceEvidenceStatus === 'executed_return_retained'
                  ? item.serviceEvidenceStatus
                  : 'delivery_receipt_retained',
              notes:
                item.notes ||
                'Returned evidence intake opened for executed copy, mail receipt, or acceptance-response upload.',
            }
          : item
      ),
      documents: [
        {
          id: evidenceDocumentId,
          entityId: flow.instrument.entityId,
          title: `Returned Evidence Intake - ${flow.instrument.title}`,
          category: 'contract',
          date: now,
          status: 'draft',
          outputStatus: 'review',
          generatedBody: `RETURNED EVIDENCE INTAKE\n\nInstrument: ${flow.instrument.title}\nLegal Identifier: ${
            flow.instrument.legalIdentifier || 'Pending'
          }\nDispatch Date: ${flow.latestDispatch?.dispatchDate || now}\nOriginal Control Goal: Retain the original or best available executed return.\nService Evidence Goal: Retain mailing receipt, courier proof, internal delivery confirmation, or executed acceptance return.\n\nUse this retained record to attach an executed copy, delivery receipt, mailing evidence, acceptance response, or dishonor return received after presentment.${dispatchFooter}`,
          linkedInstrumentIds: [flow.instrument.id],
          summary: 'Returned evidence intake for executed copy, delivery proof, or acceptance response after dispatch.',
          storageOwner: 'clearflow_retained',
          retentionClass: 'security_support',
          externalStorageStatus: 'not_applicable',
        },
        ...prev.documents,
      ],
    }));

    goToHash(`#documents:${evidenceDocumentId}`);
  };

  const launchBillExchangePresentment = (
    flow: (typeof billOfExchangeFlows)[number],
    mode: 'initial' | 'repeat' = 'initial'
  ) => {
    storeSessionDraft(presentmentDraftStorageKey, {
      title: flow.instrument.title,
      receiverName:
        flow.latestPresentment?.receiverName ||
        flow.register?.currentHolderLabel ||
        flow.instrument.counterpartyLabel ||
        '',
      receiverAccountLabel:
        flow.latestPresentment?.receiverAccountLabel ||
        flow.register?.currentHolderLabel ||
        '',
      couponReference:
        flow.latestPresentment?.couponReference || flow.instrument.legalIdentifier || '',
      presentmentDate: todayIso(),
      dueDate:
        flow.instrument.maturityDate ||
        flow.latestPresentment?.dueDate ||
        flow.obligation?.cureDeadline ||
        '',
      amount: String(
        flow.obligation?.amount ||
          flow.instrument.denominationValue ||
          flow.latestPresentment?.amount ||
          ''
      ),
      obligationId: flow.obligation?.id,
      instrumentSettlementId: flow.instrumentSettlement?.id,
      treasuryAccountId: flow.instrumentSettlement?.treasuryAccountId,
      dischargeMethod: flow.latestPresentment?.dischargeMethod || 'instrument_performance',
      parsedNotes:
        mode === 'repeat'
          ? 'Re-presentment launched from the bill of exchange control desk after prior non-performance or exception review.'
          : 'Initial bill of exchange presentment launched from the transactions control desk.',
    });
    goToHash('#accounting:new-remittance');
  };

  const handleAcceptBillExchange = (
    flow: (typeof billOfExchangeFlows)[number],
    linkedDispatchId?: string
  ) => {
    const now = todayIso();
    const acceptanceDocumentId = `doc-boe-accept-${Date.now()}`;
    const complianceTagId = `cmp-boe-accept-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      obligations: prev.obligations.map((item) =>
        item.id === flow.obligation?.id
          ? {
              ...item,
              lifecycleStage: item.lifecycleStage === 'discharged' ? item.lifecycleStage : 'presented',
              lastPresentmentDate: flow.latestPresentment?.presentmentDate || now,
              enforcementMemo:
                'Bill of exchange accepted for controlled settlement follow-through. Final discharge still depends on performance and posted evidence.',
            }
          : item
      ),
      couponPresentments: prev.couponPresentments.map((item) =>
        flow.presentments.some((presentment) => presentment.id === item.id) &&
        item.status !== 'performed'
          ? {
              ...item,
              status: 'accepted',
              notes:
                item.notes ||
                'Marked accepted from the bill of exchange control desk pending performance or final discharge.',
            }
          : item
      ),
      instrumentSettlements: prev.instrumentSettlements.map((item) =>
        item.id === flow.instrumentSettlement?.id
          ? {
              ...item,
              performanceStatus:
                item.performanceStatus === 'performed' ? item.performanceStatus : 'accepted',
              notes:
                item.notes ||
                'Acceptance recorded from the bill of exchange control desk pending performance.',
            }
          : item
      ),
      settlements: prev.settlements.map((item) =>
        item.id === flow.settlement?.id
          ? {
              ...item,
              status: item.status === 'settled' ? item.status : 'verifying',
              verificationReference:
                item.verificationReference ||
                'Drawee acceptance recorded from bill of exchange control desk.',
            }
          : item
      ),
      negotiableInstrumentRegisters: prev.negotiableInstrumentRegisters.map((item) =>
        item.id === flow.register?.id
          ? {
              ...item,
              status: item.status === 'performed' ? item.status : 'accepted',
              notes:
                item.notes ||
                'Accepted by drawee or reviewer pending final performance and discharge evidence.',
            }
          : item
      ),
      dispatchRecords: prev.dispatchRecords.map((item) =>
        item.id === linkedDispatchId
          ? {
              ...item,
              status: 'accepted',
              acceptanceStatus: 'accepted',
              originalControlStatus: 'returned_original_received',
              serviceEvidenceStatus: 'executed_return_retained',
              respondedAt: now,
              linkedDocumentIds: [...(item.linkedDocumentIds || []), acceptanceDocumentId],
            }
          : item
      ),
      holderLedgerEntries: flow.register
        ? [
            {
              id: `hle-boe-accept-${Date.now()}`,
              entityId: flow.instrument.entityId,
              registerId: flow.register.id,
              entryDate: now,
              entryType: 'presentment',
              holderEntityId: flow.register.currentHolderEntityId,
              holderConnectionId: flow.register.currentHolderConnectionId,
              holderLabel:
                flow.register.currentHolderLabel ||
                flow.latestPresentment?.receiverName ||
                'Current holder',
              amount: flow.latestPresentment?.amount || flow.register.faceAmount,
              currency: flow.register.currency,
              resultingBalance: flow.register.outstandingAmount,
              linkedInstrumentId: flow.instrument.id,
              linkedObligationId: flow.obligation?.id,
              linkedSettlementId: flow.settlement?.id,
              linkedRemittanceStatementId: flow.remittance?.id,
              notes: 'Acceptance recorded for bill of exchange presentment.',
            },
            ...prev.holderLedgerEntries,
          ]
        : prev.holderLedgerEntries,
      documents: [
        {
          id: acceptanceDocumentId,
          entityId: flow.instrument.entityId,
          title: `Acceptance Memo - ${flow.instrument.title}`,
          category: 'legal_memo',
          date: now,
          status: 'final',
          outputStatus: 'ready',
          generatedBody: `ACCEPTANCE MEMO\n\nInstrument: ${flow.instrument.title}\nLegal Identifier: ${
            flow.instrument.legalIdentifier || 'Pending'
          }\nAcceptance Date: ${now}\n\nThis memo records internal acceptance posture for the bill of exchange. Final discharge, payment, and enforceability still depend on actual performance, settlement evidence, and governing-law review.`,
          linkedInstrumentIds: [flow.instrument.id],
          summary: 'Acceptance memo generated from bill of exchange control desk.',
          storageOwner: 'clearflow_retained',
          retentionClass: 'security_support',
          externalStorageStatus: 'not_applicable',
        },
        ...prev.documents,
      ],
      complianceTags: [
        {
          id: complianceTagId,
          entityId: flow.instrument.entityId,
          label: `Bill of exchange accepted - ${flow.instrument.legalIdentifier || flow.instrument.title}`,
          category: 'risk',
          status: 'review',
          linkedDocumentIds: [acceptanceDocumentId],
          notes:
            'Acceptance recorded. Continue performance, proof-chain, and discharge follow-through before relying on final settlement.',
        },
        ...prev.complianceTags,
      ],
    }));
  };

  const handleDishonorBillExchange = (
    flow: (typeof billOfExchangeFlows)[number],
    linkedDispatchId?: string
  ) => {
    const now = todayIso();
    const dishonorDocumentId = `doc-boe-dishonor-${Date.now()}`;
    const complianceTagId = `cmp-boe-dishonor-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      obligations: prev.obligations.map((item) =>
        item.id === flow.obligation?.id
          ? {
              ...item,
              status: item.status === 'satisfied' ? item.status : 'disputed',
              lifecycleStage: item.lifecycleStage === 'discharged' ? item.lifecycleStage : 'default_review',
              defaultBasis: item.defaultBasis || 'non_payment',
              enforcementMemo:
                'Bill of exchange dishonor recorded. Review cure, protest, and external enforcement posture before further steps.',
            }
          : item
      ),
      couponPresentments: prev.couponPresentments.map((item) =>
        flow.presentments.some((presentment) => presentment.id === item.id)
          ? {
              ...item,
              status: 'exception',
              notes:
                item.notes ||
                'Marked exception after bill of exchange dishonor or non-acceptance.',
            }
          : item
      ),
      instrumentSettlements: prev.instrumentSettlements.map((item) =>
        item.id === flow.instrumentSettlement?.id
          ? {
              ...item,
              performanceStatus: 'disputed',
              notes:
                item.notes ||
                'Bill of exchange dishonor pushed this instrument settlement into dispute review.',
            }
          : item
      ),
      settlements: prev.settlements.map((item) =>
        item.id === flow.settlement?.id
          ? {
              ...item,
              status: 'exception',
              processorStatus: 'requires_review',
              executionReason:
                item.executionReason ||
                'Bill of exchange dishonored or not accepted during presentment.',
              notes:
                item.notes ||
                'Settlement moved to exception posture after bill of exchange dishonor.',
            }
          : item
      ),
      negotiableInstrumentRegisters: prev.negotiableInstrumentRegisters.map((item) =>
        item.id === flow.register?.id
          ? {
              ...item,
              status: 'disputed',
              notes:
                item.notes ||
                'Register moved to disputed posture after dishonor or non-acceptance.',
            }
          : item
      ),
      dispatchRecords: prev.dispatchRecords.map((item) =>
        item.id === linkedDispatchId
          ? {
              ...item,
              status: 'dishonored',
              acceptanceStatus: 'dishonored',
              originalControlStatus:
                item.returnedEvidenceDocumentId ? 'returned_original_received' : 'executed_copy_only',
              serviceEvidenceStatus:
                item.returnedEvidenceDocumentId ? 'executed_return_retained' : 'delivery_receipt_retained',
              counselReviewStatus: 'recommended',
              respondedAt: now,
              linkedDocumentIds: [...(item.linkedDocumentIds || []), dishonorDocumentId],
            }
          : item
      ),
      holderLedgerEntries: flow.register
        ? [
            {
              id: `hle-boe-dishonor-${Date.now()}`,
              entityId: flow.instrument.entityId,
              registerId: flow.register.id,
              entryDate: now,
              entryType: 'dishonor',
              holderEntityId: flow.register.currentHolderEntityId,
              holderConnectionId: flow.register.currentHolderConnectionId,
              holderLabel:
                flow.register.currentHolderLabel ||
                flow.latestPresentment?.receiverName ||
                'Current holder',
              amount: flow.latestPresentment?.amount || flow.register.outstandingAmount,
              currency: flow.register.currency,
              resultingBalance: flow.register.outstandingAmount,
              linkedInstrumentId: flow.instrument.id,
              linkedObligationId: flow.obligation?.id,
              linkedSettlementId: flow.settlement?.id,
              linkedRemittanceStatementId: flow.remittance?.id,
              notes: 'Dishonor recorded from bill of exchange control desk.',
            },
            ...prev.holderLedgerEntries,
          ]
        : prev.holderLedgerEntries,
      documents: [
        {
          id: dishonorDocumentId,
          entityId: flow.instrument.entityId,
          title: `Notice of Dishonor - ${flow.instrument.title}`,
          category: 'legal_memo',
          date: now,
          status: 'final',
          outputStatus: 'ready',
          generatedBody: `NOTICE OF DISHONOR\n\nInstrument: ${flow.instrument.title}\nLegal Identifier: ${
            flow.instrument.legalIdentifier || 'Pending'
          }\nDishonor Date: ${now}\n\nThis internal record captures dishonor or non-acceptance of the bill of exchange. Review protest rights, cure posture, and any outside enforcement process before escalation.`,
          linkedInstrumentIds: [flow.instrument.id],
          summary: 'Dishonor notice generated from bill of exchange control desk.',
          storageOwner: 'clearflow_retained',
          retentionClass: 'security_support',
          externalStorageStatus: 'not_applicable',
        },
        ...prev.documents,
      ],
      complianceTags: [
        {
          id: complianceTagId,
          entityId: flow.instrument.entityId,
          label: `Dishonor review - ${flow.instrument.legalIdentifier || flow.instrument.title}`,
          category: 'risk',
          status: 'restricted',
          linkedDocumentIds: [dishonorDocumentId],
          notes:
            'Dishonor recorded. Review protest, cure, and governing-law steps before any external enforcement action.',
        },
        ...prev.complianceTags,
      ],
    }));
  };

  const handleProtestBillExchange = (flow: (typeof billOfExchangeFlows)[number]) => {
    const now = todayIso();
    const protestDocumentId = `doc-boe-protest-${Date.now()}`;
    const complianceTagId = `cmp-boe-protest-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      obligations: prev.obligations.map((item) =>
        item.id === flow.obligation?.id
          ? {
              ...item,
              enforcementMemo:
                'Protest support packet issued for bill of exchange. Validate applicable law, notice timing, and evidence requirements before any outside use.',
            }
          : item
      ),
      negotiableInstrumentRegisters: prev.negotiableInstrumentRegisters.map((item) =>
        item.id === flow.register?.id
          ? {
              ...item,
              status: item.status === 'performed' ? item.status : 'disputed',
              notes:
                item.notes ||
                'Protest support recorded for this bill of exchange after dishonor review.',
            }
          : item
      ),
      holderLedgerEntries: flow.register
        ? [
            {
              id: `hle-boe-protest-${Date.now()}`,
              entityId: flow.instrument.entityId,
              registerId: flow.register.id,
              entryDate: now,
              entryType: 'protest',
              holderEntityId: flow.register.currentHolderEntityId,
              holderConnectionId: flow.register.currentHolderConnectionId,
              holderLabel:
                flow.register.currentHolderLabel ||
                flow.latestPresentment?.receiverName ||
                'Current holder',
              amount: flow.latestPresentment?.amount || flow.register.outstandingAmount,
              currency: flow.register.currency,
              resultingBalance: flow.register.outstandingAmount,
              linkedInstrumentId: flow.instrument.id,
              linkedObligationId: flow.obligation?.id,
              linkedSettlementId: flow.settlement?.id,
              linkedRemittanceStatementId: flow.remittance?.id,
              notes: 'Protest support recorded for the bill of exchange.',
            },
            ...prev.holderLedgerEntries,
          ]
        : prev.holderLedgerEntries,
      documents: [
        {
          id: protestDocumentId,
          entityId: flow.instrument.entityId,
          title: `Protest Packet - ${flow.instrument.title}`,
          category: 'legal_memo',
          date: now,
          status: 'final',
          outputStatus: 'ready',
          generatedBody: `PROTEST SUPPORT PACKET\n\nInstrument: ${flow.instrument.title}\nLegal Identifier: ${
            flow.instrument.legalIdentifier || 'Pending'
          }\nPacket Date: ${now}\n\nUse this packet to collect notice, presentment, dishonor, and holder evidence for protest review. Confirm the governing law and actual protest requirements with counsel before relying on this record externally.`,
          linkedInstrumentIds: [flow.instrument.id],
          summary: 'Protest support packet generated from bill of exchange control desk.',
          storageOwner: 'clearflow_retained',
          retentionClass: 'security_support',
          externalStorageStatus: 'not_applicable',
        },
        ...prev.documents,
      ],
      complianceTags: [
        {
          id: complianceTagId,
          entityId: flow.instrument.entityId,
          label: `Protest packet issued - ${flow.instrument.legalIdentifier || flow.instrument.title}`,
          category: 'risk',
          status: 'review',
          linkedDocumentIds: [protestDocumentId],
          notes:
            'Protest support issued. Confirm notice timing, evidence, and governing-law requirements before any external protest step.',
        },
        ...prev.complianceTags,
      ],
    }));
  };

  const handleStartCure = (obligationId: string) => {
    const now = todayIso();
    const cureDeadline = addDaysToIsoDate(now, 10);
    setData((prev) => {
      const obligation = prev.obligations.find((item) => item.id === obligationId);
      if (!obligation) {
        return prev;
      }

      const tagId = `cmp-cure-${Date.now()}`;
      return {
        ...prev,
        obligations: prev.obligations.map((item) =>
          item.id === obligationId
            ? {
                ...item,
                lifecycleStage: 'cure_running',
                cureDeadline,
                enforcementMemo:
                  item.enforcementMemo ||
                  'Cure period opened after presentment to track controlled performance before default.',
              }
            : item
        ),
        complianceTags: [
          {
            id: tagId,
            entityId: obligation.entityId,
            label: `Cure running - ${obligation.title}`,
            category: 'risk',
            status: 'review',
            dueDate: cureDeadline,
            notes:
              'Internal default-control tracking only. Monitor cure period and evidence of performance or discharge.',
          },
          ...prev.complianceTags,
        ],
      };
    });
  };

  const handleDeclareDefault = (summary: ObligationLifecycleSummary) => {
    const now = todayIso();
    const defaultNoticeId = `doc-default-${Date.now()}`;
    const complianceTagId = `cmp-default-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      obligations: prev.obligations.map((item) =>
        item.id === summary.obligation.id
          ? {
              ...item,
              status: 'defaulted',
              lifecycleStage: 'defaulted',
              defaultBasis: item.defaultBasis || 'non_performance',
              defaultDeclaredAt: now,
              defaultNoticeDocumentId: defaultNoticeId,
              enforcementMemo:
                item.enforcementMemo ||
                'Default declared inside controlled private-ledger workflow pending review of governing documents and any outside enforcement rights.',
            }
          : item
      ),
      instrumentSettlements: prev.instrumentSettlements.map((item) =>
        item.obligationId === summary.obligation.id && item.performanceStatus !== 'performed'
          ? {
              ...item,
              performanceStatus: 'disputed',
              notes:
                item.notes ||
                'Moved to disputed status after internal default declaration review.',
            }
          : item
      ),
      settlements: prev.settlements.map((item) =>
        summary.obligation.linkedSettlementIds?.includes(item.id) ||
        item.linkedInstrumentSettlementId === summary.linkedInstrumentSettlement?.id
          ? {
              ...item,
              status: item.status === 'settled' ? item.status : 'exception',
              processorStatus:
                item.status === 'settled' ? item.processorStatus : 'requires_review',
              executionReason:
                item.executionReason ||
                'Internal default review opened before discharge could be completed.',
              notes:
                item.notes ||
                'Settlement placed into exception posture pending default review.',
            }
          : item
      ),
      negotiableInstrumentRegisters: prev.negotiableInstrumentRegisters.map((item) =>
        item.obligationId === summary.obligation.id ||
        summary.obligation.linkedInstrumentIds?.includes(item.instrumentId || '')
          ? {
              ...item,
              status: item.status === 'performed' ? item.status : 'disputed',
              notes:
                item.notes ||
                'Register flagged for default review pending cure or documented discharge.',
            }
          : item
      ),
      documents: [
        {
          id: defaultNoticeId,
          entityId: summary.obligation.entityId,
          title: `Notice of Default - ${summary.obligation.title}`,
          category: 'legal_memo',
          date: now,
          status: 'final',
          outputStatus: 'ready',
          generatedBody: `DEFAULT NOTICE\n\nObligation: ${summary.obligation.title}\nLegal Identifier: ${
            summary.obligation.legalIdentifier || 'Pending'
          }\nDeclared Date: ${now}\nBasis: ${
            summary.obligation.defaultBasis || 'non_performance'
          }\n\nThis record is an internal control notice for tracking default, cure failure, and follow-up. Review governing documents before any outside enforcement step.`,
          linkedInstrumentIds: summary.obligation.linkedInstrumentIds,
          summary: 'Internal default notice and review memo.',
          storageOwner: 'clearflow_retained',
          retentionClass: 'security_support',
          externalStorageStatus: 'not_applicable',
        },
        ...prev.documents,
      ],
      complianceTags: [
        {
          id: complianceTagId,
          entityId: summary.obligation.entityId,
          label: `Default review - ${summary.obligation.title}`,
          category: 'risk',
          status: 'restricted',
          linkedDocumentIds: [defaultNoticeId],
          notes:
            'Default recorded inside controlled settlement workflow. Review governing documents and any outside rail requirements before external action.',
        },
        ...prev.complianceTags,
      ],
    }));
  };

  const handleDischargeObligation = (summary: ObligationLifecycleSummary) => {
    const now = todayIso();
    const register = summary.linkedRegister;
    const performanceEntryId = `hle-discharge-${Date.now()}`;
    const proofTokenId = `tok-discharge-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      obligations: prev.obligations.map((item) =>
        item.id === summary.obligation.id
          ? {
              ...item,
              status: 'satisfied',
              lifecycleStage: 'discharged',
              dischargedAt: now,
              gainOrLossOnDischarge: item.gainOrLossOnDischarge ?? 0,
              enforcementMemo:
                item.enforcementMemo ||
                'Discharge completed and tied back to settlement, remittance, and holder-ledger evidence.',
            }
          : item
      ),
      settlements: prev.settlements.map((item) =>
        summary.obligation.linkedSettlementIds?.includes(item.id) ||
        item.id === summary.linkedSettlement?.id
          ? {
              ...item,
              status: 'settled',
              actualSettlementDate: item.actualSettlementDate || now,
              verificationStatus:
                item.verificationStatus === 'verified' ? item.verificationStatus : 'verified',
              processorStatus: item.processorStatus === 'blocked' ? 'settled' : item.processorStatus,
              releasedAt: item.releasedAt || new Date().toISOString(),
              liquidCashStage:
                item.liquidCashStage === 'liquid_cash_released'
                  ? item.liquidCashStage
                  : 'liquid_cash_released',
              tokenizedProofId: item.tokenizedProofId || proofTokenId,
              linkedTokenIds: Array.from(new Set([proofTokenId, ...(item.linkedTokenIds ?? [])])),
            }
          : item
      ),
      remittanceStatements: prev.remittanceStatements.map((item) =>
        summary.obligation.linkedRemittanceStatementIds?.includes(item.id) ||
        item.id === summary.linkedRemittanceStatement?.id
          ? {
              ...item,
              status: 'performed',
              notes: item.notes || 'Marked performed from default/discharge control desk.',
            }
          : item
      ),
      couponPresentments: prev.couponPresentments.map((item) =>
        summary.obligation.linkedCouponPresentmentIds?.includes(item.id) ||
        item.id === summary.linkedCouponPresentment?.id
          ? {
              ...item,
              status: 'performed',
              linkedTokenIds: Array.from(new Set([proofTokenId, ...(item.linkedTokenIds ?? [])])),
            }
          : item
      ),
      instrumentSettlements: prev.instrumentSettlements.map((item) =>
        item.obligationId === summary.obligation.id
          ? {
              ...item,
              performanceStatus: 'performed',
              performedAmount: Math.max(item.performedAmount, summary.obligation.amount),
              linkedTokenIds: Array.from(new Set([proofTokenId, ...(item.linkedTokenIds ?? [])])),
            }
          : item
      ),
      negotiableInstrumentRegisters: register
        ? prev.negotiableInstrumentRegisters.map((item) =>
            item.id === register.id
              ? {
                  ...item,
                  status: 'performed',
                  outstandingAmount: 0,
                  linkedTokenIds: Array.from(new Set([proofTokenId, ...(item.linkedTokenIds ?? [])])),
                }
              : item
          )
        : prev.negotiableInstrumentRegisters,
      holderLedgerEntries: register
        ? [
            {
              id: performanceEntryId,
              entityId: summary.obligation.entityId,
              registerId: register.id,
              entryDate: now,
              entryType: 'performance',
              holderEntityId: register.currentHolderEntityId,
              holderConnectionId: register.currentHolderConnectionId,
              holderLabel: register.currentHolderLabel || 'Current holder',
              amount: summary.outstandingAmount || summary.obligation.amount,
              currency: register.currency,
              resultingBalance: 0,
              linkedInstrumentId: register.instrumentId,
              linkedObligationId: summary.obligation.id,
              linkedSettlementId: summary.linkedSettlement?.id,
              linkedRemittanceStatementId: summary.linkedRemittanceStatement?.id,
              linkedTokenIds: [proofTokenId],
              notes: 'Discharge completed from transactions control desk.',
            },
            ...prev.holderLedgerEntries,
          ]
        : prev.holderLedgerEntries,
      tokens: [
        {
          id: proofTokenId,
          entityId: summary.obligation.entityId,
          subjectType: 'settlement',
          subjectId: summary.linkedSettlement?.id || summary.obligation.id,
          label: `Discharge Proof - ${summary.obligation.title}`,
          status: 'verified',
          tokenStandard: 'internal-proof',
          tokenReference: `DISC-${Date.now()}`,
          issuedAt: new Date().toISOString(),
          verifiedAt: new Date().toISOString(),
          proofReference:
            'Issued from the default and discharge desk after settlement, remittance, and holder-ledger tie-out.',
        },
        ...prev.tokens,
      ],
    }));
  };

  const launchProofChainCure = (chain: (typeof transactionProofChains)[number]) => {
    const transaction = transactionById.get(chain.transactionId);
    const settlement = chain.settlementId ? settlementById.get(chain.settlementId) : undefined;
    const action = resolveProofChainAction(chain);

    if (action.hash === '#accounting:new-presentment') {
      queueAccountingDraft(presentmentDraftStorageKey, {
        title: transaction?.title || chain.title,
        presentmentDate: transaction?.date || todayIso(),
        dueDate: settlement?.expectedSettlementDate || '',
        amount: String(transaction?.amount ?? ''),
        obligationId: undefined,
        instrumentSettlementId: settlement?.linkedInstrumentSettlementId,
        treasuryAccountId:
          settlement?.originSourceType === 'manual_remittance' ? settlement.originSourceId : '',
        sourceBankAccountId:
          settlement?.originSourceType === 'bank_account' ? settlement.originSourceId : '',
        sourceLedgerAccountId:
          settlement?.originSourceType === 'ledger_account' ? settlement.originSourceId : '',
        dischargeMethod: settlement?.dischargeMethod || 'instrument_performance',
        parsedNotes: `Generated from proof-chain cure routing for ${chain.transactionId}. Watch reasons: ${chain.watchReasons.join(', ')}.`,
      });
      goToHash(action.hash);
      return;
    }

    if (action.hash === '#accounting:new-payment') {
      queueAccountingDraft(paymentDraftStorageKey, {
        direction: settlement?.direction || 'outgoing',
        paymentDate: transaction?.date || todayIso(),
        amount: String(transaction?.amount ?? ''),
        method:
          settlement?.executionRail === 'Fedwire'
            ? 'wire'
            : settlement?.executionRail === 'LedgerRemittance'
              ? 'other'
              : 'ach',
        treasuryAccountId:
          settlement?.originSourceType === 'manual_remittance' ? settlement.originSourceId : '',
        sourceBankAccountId:
          settlement?.originSourceType === 'bank_account' ? settlement.originSourceId : '',
        sourceLedgerAccountId:
          settlement?.originSourceType === 'ledger_account' ? settlement.originSourceId : '',
        dischargeMethod: settlement?.dischargeMethod || 'bank_rail_payment',
        notes: `Generated from proof-chain cure routing for ${chain.transactionId}. Watch reasons: ${chain.watchReasons.join(', ')}.`,
      });
      goToHash(action.hash);
      return;
    }

    goToHash(action.hash);
  };

  const resolveSettlementAction = (flow: (typeof settlementFlows)[number]) => {
    if (flow.transaction.linkedDocumentIds?.[0]) {
      return {
        label: 'Open Supporting Packet',
        hash: `#documents:${flow.transaction.linkedDocumentIds[0]}`,
      };
    }

    if (flow.settlement?.status === 'exception' || flow.derivedAutoReconcileStatus === 'exception') {
      return { label: 'Open Accounting Payments', hash: '#accounting:payments' };
    }

    if (flow.reconciliation) {
      return { label: 'Open Reconciliation', hash: '#accounting:reconciliation' };
    }

    return { label: 'Open Accounting', hash: '#accounting:dashboard' };
  };

  const resolveObligationAction = (obligation: CoreDataBundle['obligations'][number]) => {
    if (obligation.linkedDocumentIds?.[0]) {
      return { label: 'Open Packet', hash: `#documents:${obligation.linkedDocumentIds[0]}` };
    }

    if (obligation.recurringSchedule?.enabled) {
      return { label: 'Open Recurring Desk', hash: '#accounting:recurring' };
    }

    return { label: 'Open Accounting', hash: '#accounting:dashboard' };
  };

  const resolveRemittanceAction = (record: CoreDataBundle['remittanceStatements'][number]) => {
    if (record.linkedSettlementId) {
      return { label: 'Open Payments', hash: '#accounting:payments' };
    }

    if (record.linkedInstrumentSettlementId) {
      return { label: 'Open Instrument Desk', hash: '#transactions' };
    }

    return { label: 'Open Documents', hash: '#documents' };
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Transactions</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Every transaction now sits in a settlement flow: route to liquid cash, verify the credit
          or debit, tie the journal layer back automatically, and distinguish internal treasury
          discharge from bank-rail settlement.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Transactions" value={data.transactions.length} />
        <StatCard label="Settlement Coverage" value={coveredTransactions} />
        <StatCard label="Liquid Cash Ready" value={liquidCashReadyCount} />
        <StatCard label="Verified Credits / Debits" value={verifiedCount} />
        <StatCard label="Inter-Entity Halves" value={interEntityMoveCount} />
        <StatCard label="N.I. Registers" value={registerCount} />
        <StatCard label="Holder Ledger Entries" value={holderLedgerCount} />
        <StatCard label="Sealed Proof Chains" value={sealedProofChainCount} />
        <StatCard label="Defaults" value={defaultedObligationCount} />
        <StatCard label="Discharged Obligations" value={dischargedObligationCount} />
        <StatCard label="Auto Reconciled" value={autoMatchedCount} subvalue={`${exceptionCount} need attention`} />
      </div>

      <PageSection
        title="Encrypted Proof Chains"
        description="Transactions are chained to their movement identifiers, settlements, payments, and verification tokens, then mirrored into the encrypted backend proof vault."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {transactionProofChains.map((chain) => {
            const recommendedAction = resolveProofChainAction(chain);

            return (
            <RecordCard
              key={chain.chainId}
              title={chain.title}
              subtitle={`chain ${chain.chainIndex} · ${chain.verificationStatus} · ${chain.date}`}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => launchProofChainCure(chain)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(126,242,255,0.28)',
                    background: 'rgba(54, 215, 255, 0.09)',
                    color: '#effcff',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {recommendedAction.label}
                </button>
                <div style={{ color: 'var(--cf-muted)', alignSelf: 'center' }}>
                  {recommendedAction.detail}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Transaction / settlement:</strong>{' '}
                  {chain.transactionId} / {chain.settlementId || 'No settlement linked'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Previous chain:</strong>{' '}
                  {chain.previousChainId || 'Origin chain'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Payments / movement identifiers:</strong>{' '}
                  {chain.paymentIds.length} payment links / {chain.movementIdentifierIds.length} identifiers
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Verification tokens:</strong>{' '}
                  {chain.tokenIds.length ? chain.tokenIds.join(', ') : 'No verification tokens linked yet'}
                </div>
                {chain.watchReasons.length ? (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Watch reasons:</strong>{' '}
                    {chain.watchReasons.join(' | ')}
                  </div>
                ) : (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Watch reasons:</strong> Fully sealed
                    movement, settlement, identifier, and proof-token chain.
                  </div>
                )}
              </div>
            </RecordCard>
          )})}
        </div>
      </PageSection>

      <PageSection
        title="Default & Discharge Control"
        description="Move obligations through presentment, cure, default review, and discharge with linked remittance, settlement, register, and holder-ledger evidence."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {obligationLifecycleSummaries.map((summary) => (
            <RecordCard
              key={summary.obligation.id}
              title={summary.obligation.title}
              subtitle={`${summary.stage} · ${summary.obligation.status} · ${formatMoney(summary.obligation.amount, 'USD')}`}
            >
              <div style={{ display: 'grid', gap: 12, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {statusPill(`Stage: ${summary.stage}`, summary.stage === 'defaulted' ? 'rose' : summary.stage === 'discharged' ? 'teal' : 'gold')}
                  {statusPill(`Presentments: ${summary.presentmentCount}`, summary.presentmentCount ? 'blue' : 'gold')}
                  {statusPill(
                    `Outstanding: ${formatMoney(summary.outstandingAmount, 'USD')}`,
                    summary.outstandingAmount === 0 ? 'teal' : 'gold'
                  )}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Legal identifier:</strong>{' '}
                  {summary.obligation.legalIdentifier || 'Not assigned'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Last presentment / cure:</strong>{' '}
                  {summary.obligation.lastPresentmentDate || 'Not presented'}{' '}
                  {summary.obligation.cureDeadline
                    ? `| cure deadline ${summary.obligation.cureDeadline}`
                    : ''}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Linked register / remittance:</strong>{' '}
                  {summary.linkedRegister?.registerLabel || 'No register'} /{' '}
                  {summary.linkedRemittanceStatement?.title || 'No remittance'}
                </div>
                {summary.watchItems.length ? (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Watch items:</strong>{' '}
                    {summary.watchItems.join(' | ')}
                  </div>
                ) : null}
                {summary.obligation.enforcementMemo ? (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Control memo:</strong>{' '}
                    {summary.obligation.enforcementMemo}
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {summary.canPresent ? (
                    <button
                      type="button"
                      onClick={() => goToHash('#accounting:new-presentment')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(126,242,255,0.28)',
                        background: 'rgba(54, 215, 255, 0.09)',
                        color: '#effcff',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Present / Re-Present
                    </button>
                  ) : null}
                  {summary.canStartCure ? (
                    <button
                      type="button"
                      onClick={() => handleStartCure(summary.obligation.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(247,211,123,0.28)',
                        background: 'rgba(247, 211, 123, 0.09)',
                        color: '#fff2cc',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Start Cure Window
                    </button>
                  ) : null}
                  {summary.canDeclareDefault ? (
                    <button
                      type="button"
                      onClick={() => handleDeclareDefault(summary)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,160,195,0.28)',
                        background: 'rgba(255, 120, 160, 0.09)',
                        color: '#ffe1eb',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Declare Default
                    </button>
                  ) : null}
                  {summary.canDischarge ? (
                    <button
                      type="button"
                      onClick={() => handleDischargeObligation(summary)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(140,235,191,0.28)',
                        background: 'rgba(80, 214, 156, 0.1)',
                        color: '#dcfff0',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Mark Discharged
                    </button>
                  ) : null}
                </div>
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Bill Of Exchange Control"
        description="Launch presentment into Accounting, then track acceptance, dishonor, protest support, and linked register or holder-ledger evidence for exchange instruments."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {billOfExchangeFlows.length === 0 ? (
            <div style={{ color: 'var(--cf-muted)' }}>
              No international or exchange-style drafts are active yet.
            </div>
          ) : (
            billOfExchangeFlows.map((flow) => (
              <RecordCard
                key={flow.instrument.id}
                title={flow.instrument.title}
                subtitle={`${flow.instrument.legalIdentifier || 'No legal identifier'} · ${formatMoney(
                  flow.instrument.denominationValue || flow.obligation?.amount || 0,
                  'USD'
                )}`}
              >
                <div style={{ display: 'grid', gap: 12, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {statusPill(
                      `Register: ${flow.register?.status || 'not registered'}`,
                      flow.register?.status === 'performed'
                        ? 'teal'
                        : flow.register?.status === 'disputed'
                          ? 'rose'
                          : 'blue'
                    )}
                    {statusPill(
                      `Presentment: ${flow.latestPresentment?.status || 'not started'}`,
                      flow.latestPresentment?.status === 'performed'
                        ? 'teal'
                        : flow.latestPresentment?.status === 'exception'
                          ? 'rose'
                          : flow.latestPresentment?.status === 'accepted'
                            ? 'blue'
                            : 'gold'
                    )}
                    {statusPill(
                      `Settlement: ${flow.settlement?.status || 'not linked'}`,
                      flow.settlement?.status === 'settled'
                        ? 'teal'
                        : flow.settlement?.status === 'exception'
                          ? 'rose'
                          : flow.settlement
                            ? 'gold'
                            : 'blue'
                    )}
                    {flow.latestDispatch
                      ? statusPill(
                          `Dispatch: ${flow.latestDispatch.status}`,
                          dispatchTone(flow.latestDispatch.status)
                        )
                      : statusPill('Dispatch: not sent', 'blue')}
                    {flow.latestDispatch
                      ? statusPill(
                          `Response: ${flow.latestDispatch.acceptanceStatus}`,
                          acceptanceTone(flow.latestDispatch.acceptanceStatus)
                        )
                      : null}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Holder / drawee posture:</strong>{' '}
                    {flow.register?.currentHolderLabel ||
                      flow.latestPresentment?.receiverName ||
                      flow.instrument.counterpartyLabel ||
                      'Pending holder or drawee'}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Linked obligation / remittance:</strong>{' '}
                    {flow.obligation?.title || 'No obligation linked'} / {flow.remittance?.title || 'No remittance yet'}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Latest presentment:</strong>{' '}
                    {flow.latestPresentment
                      ? `${flow.latestPresentment.presentmentDate} | ${formatMoney(
                          flow.latestPresentment.amount,
                          flow.latestPresentment.currency
                        )}`
                      : 'No presentment posted yet'}
                  </div>
                    <div>
                      <strong style={{ color: 'var(--cf-text)' }}>Dispatch posture:</strong>{' '}
                      {flow.latestDispatch
                        ? `${dispatchMethodLabel(flow.latestDispatch.method)} sent ${
                            flow.latestDispatch.dispatchDate
                          } | response ${flow.latestDispatch.acceptanceStatus}`
                        : 'No send-for-acceptance record yet'}
                    </div>
                  {flow.latestDispatch ? (
                    <div>
                      <strong style={{ color: 'var(--cf-text)' }}>Legal posture:</strong>{' '}
                      {flow.latestDispatch.governingLawLabel || 'Jurisdiction review required'} /{' '}
                      {flow.latestDispatch.governingVenueLabel || 'Venue review required'} | original{' '}
                      {flow.latestDispatch.originalControlStatus} | service{' '}
                      {flow.latestDispatch.serviceEvidenceStatus}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() =>
                        launchBillExchangePresentment(
                          flow,
                          flow.latestPresentment ? 'repeat' : 'initial'
                        )
                      }
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(126,242,255,0.28)',
                        background: 'rgba(54, 215, 255, 0.09)',
                        color: '#effcff',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      {flow.latestPresentment ? 'Re-Present Bill' : 'Present Bill'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleDispatchBillExchange(
                          flow,
                          flow.holderConnection?.connectedEntityId ? 'internal_clearflow' : 'postal_mail'
                        )
                      }
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(148,163,184,0.28)',
                        background: 'rgba(15, 23, 42, 0.4)',
                        color: '#f8fafc',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      {flow.latestDispatch ? 'Re-Send For Acceptance' : 'Send For Acceptance'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAcceptBillExchange(flow)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(140,235,191,0.28)',
                        background: 'rgba(80, 214, 156, 0.1)',
                        color: '#dcfff0',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Mark Accepted
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrepareReturnEvidence(flow, flow.latestDispatch?.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(188,220,255,0.28)',
                        background: 'rgba(88, 141, 255, 0.08)',
                        color: '#e4efff',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Open Returned Copy Intake
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDishonorBillExchange(flow)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,160,195,0.28)',
                        background: 'rgba(255, 120, 160, 0.09)',
                        color: '#ffe1eb',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Record Dishonor
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProtestBillExchange(flow)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(247,211,123,0.28)',
                        background: 'rgba(247, 211, 123, 0.09)',
                        color: '#fff2cc',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Issue Protest Packet
                    </button>
                    {flow.packetId ? (
                      <button
                        type="button"
                        onClick={() => goToHash(`#documents:${flow.packetId}`)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid rgba(148,163,184,0.28)',
                          background: 'rgba(148,163,184,0.08)',
                          color: '#e5e7eb',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Open Packet
                      </button>
                    ) : null}
                  </div>
                </div>
              </RecordCard>
            ))
          )}
        </div>
      </PageSection>

      <PageSection
        title="Dispatch & Acceptance Desk"
        description="Track who each exchange packet was sent to, how it was sent, which proof identity was used, and whether a returned copy, acceptance, or dishonor response came back."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <StatCard label="Dispatches Active" value={String(activeDispatchCount)} />
            <StatCard label="Awaiting Response" value={String(pendingAcceptanceDispatchCount)} />
            <StatCard
              label="Accepted Returns"
              value={String(
                data.dispatchRecords.filter((item) => item.acceptanceStatus === 'accepted').length
              )}
            />
            <StatCard
              label="Dishonor Returns"
              value={String(
                data.dispatchRecords.filter((item) => item.acceptanceStatus === 'dishonored').length
              )}
            />
          </div>
          {billOfExchangeFlows.filter((flow) => flow.latestDispatch).length === 0 ? (
            <div style={{ color: 'var(--cf-muted)' }}>
              No acceptance dispatches have been launched yet. Use the bill of exchange control desk to send one.
            </div>
          ) : (
            billOfExchangeFlows
              .filter((flow) => flow.latestDispatch)
              .map((flow) => (
                <RecordCard
                  key={`dispatch-${flow.instrument.id}`}
                  title={flow.latestDispatch?.title || flow.instrument.title}
                  subtitle={`${flow.instrument.legalIdentifier || 'No legal identifier'} Â· ${
                    flow.latestDispatch?.recipientLabel || 'Pending recipient'
                  }`}
                >
                  <div style={{ display: 'grid', gap: 12, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {flow.latestDispatch
                        ? statusPill(
                            `Method: ${dispatchMethodLabel(flow.latestDispatch.method)}`,
                            'blue'
                          )
                        : null}
                      {flow.latestDispatch
                        ? statusPill(
                            `Status: ${flow.latestDispatch.status}`,
                            dispatchTone(flow.latestDispatch.status)
                          )
                        : null}
                      {flow.latestDispatch
                        ? statusPill(
                            `Acceptance: ${flow.latestDispatch.acceptanceStatus}`,
                            acceptanceTone(flow.latestDispatch.acceptanceStatus)
                          )
                        : null}
                      {flow.latestDispatch
                        ? statusPill(
                            `Original: ${flow.latestDispatch.originalControlStatus}`,
                            originalControlTone(flow.latestDispatch.originalControlStatus)
                          )
                        : null}
                      {flow.latestDispatch
                        ? statusPill(
                            `Service: ${flow.latestDispatch.serviceEvidenceStatus}`,
                            serviceEvidenceTone(flow.latestDispatch.serviceEvidenceStatus)
                          )
                        : null}
                      {flow.latestDispatch
                        ? statusPill(
                            `Counsel: ${flow.latestDispatch.counselReviewStatus}`,
                            counselTone(flow.latestDispatch.counselReviewStatus)
                          )
                        : null}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--cf-text)' }}>Dispatch identity:</strong>{' '}
                      {flow.latestDispatch?.proofSealCode || 'No proof seal'} /{' '}
                      {flow.latestDispatch?.mailingLine || 'No mailing line'}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--cf-text)' }}>Response window:</strong>{' '}
                      {flow.latestDispatch?.dispatchDate || 'Pending'} to{' '}
                      {flow.latestDispatch?.expectedResponseDate || 'Not set'}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--cf-text)' }}>Governing posture:</strong>{' '}
                      {flow.latestDispatch?.governingLawLabel || 'Jurisdiction review required'} /{' '}
                      {flow.latestDispatch?.governingVenueLabel || 'Venue review required'} | protest review by{' '}
                      {flow.latestDispatch?.protestDeadline || 'Not set'}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--cf-text)' }}>Effectiveness note:</strong>{' '}
                      {flow.latestDispatch?.enforceabilityNotes ||
                        'Retain actual delivery and returned evidence before relying on outside enforcement.'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handlePrepareReturnEvidence(flow, flow.latestDispatch?.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid rgba(188,220,255,0.28)',
                          background: 'rgba(88, 141, 255, 0.08)',
                          color: '#e4efff',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Log Returned Evidence
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcceptBillExchange(flow, flow.latestDispatch?.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid rgba(140,235,191,0.28)',
                          background: 'rgba(80, 214, 156, 0.1)',
                          color: '#dcfff0',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Confirm Returned Acceptance
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDishonorBillExchange(flow, flow.latestDispatch?.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid rgba(255,160,195,0.28)',
                          background: 'rgba(255, 120, 160, 0.09)',
                          color: '#ffe1eb',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Confirm Dishonor Return
                      </button>
                      {flow.latestDispatch?.linkedDocumentIds?.[0] ? (
                        <button
                          type="button"
                          onClick={() =>
                            goToHash(`#documents:${flow.latestDispatch?.linkedDocumentIds?.[0]}`)
                          }
                          style={{
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: '1px solid rgba(148,163,184,0.28)',
                            background: 'rgba(148,163,184,0.08)',
                            color: '#e5e7eb',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          Open Dispatch Packet
                        </button>
                      ) : null}
                    </div>
                  </div>
                </RecordCard>
              ))
          )}
        </div>
      </PageSection>

      <PageSection
        title="Negotiable Instrument Register"
        description="Issued notes, bonds, futures, and collateral-backed instruments with legal identifiers, current holder, backing rail, and reserve support."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.negotiableInstrumentRegisters.map((record) => (
            <RecordCard
              key={record.id}
              title={record.registerLabel}
              subtitle={`${record.instrumentForm} · ${record.status} · ${record.legalIdentifier}`}
            >
              <div style={{ display: 'grid', gap: 8, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Current holder:</strong>{' '}
                  {record.currentHolderLabel || 'Not assigned'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Face / outstanding:</strong>{' '}
                  {formatMoney(record.faceAmount, record.currency)} /{' '}
                  {formatMoney(record.outstandingAmount, record.currency)}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Backing rail / treasury:</strong>{' '}
                  {record.backingCreditRailId || 'No rail linked'} /{' '}
                  {record.backingTreasuryAccountId || 'No treasury linked'}
                </div>
                {record.linkedDocumentIds?.[0] ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => goToHash(`#documents:${record.linkedDocumentIds?.[0]}`)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(126,242,255,0.28)',
                        background: 'rgba(54, 215, 255, 0.09)',
                        color: '#effcff',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Open Register Packet
                    </button>
                  </div>
                ) : null}
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Holder Ledger"
        description="Holder-side issue, assignment, presentment, pledge, deposit, and performance entries tied back to instruments, remittances, and settlements."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.holderLedgerEntries.map((entry) => (
            <RecordCard
              key={entry.id}
              title={`${entry.holderLabel} · ${entry.entryType}`}
              subtitle={`${entry.entryDate} · ${formatMoney(entry.amount, entry.currency)}`}
            >
              <div style={{ display: 'grid', gap: 8, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Resulting balance:</strong>{' '}
                  {formatMoney(entry.resultingBalance, entry.currency)}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Register:</strong> {entry.registerId}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Settlement / remittance:</strong>{' '}
                  {entry.linkedSettlementId || 'No settlement linked'} /{' '}
                  {entry.linkedRemittanceStatementId || 'No remittance linked'}
                </div>
                {entry.notes ? (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Notes:</strong> {entry.notes}
                  </div>
                ) : null}
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Bond Issuance & Application Desk"
        description="Track issuance, register control, holder-ledger application events, and how each bond is actually being applied into reserve, collateral, or settlement."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {bondLifecycleViews.length === 0 ? (
            <RecordCard title="No bond rails yet" subtitle="Issue a bond or classify an instrument as bond paper">
              The bond desk will show issuance packets, register control, holder-ledger application events, and linked settlement posture once bond paper is in the workspace.
            </RecordCard>
          ) : (
            bondLifecycleViews.map((view) => (
              <RecordCard
                key={view.instrument.id}
                title={view.instrument.title}
                subtitle={`${view.currentStage} · ${view.faceAmountLabel} · ${view.applicationLabel}`}
              >
                <div style={{ display: 'grid', gap: 10, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {statusPill(`Stage: ${view.currentStage}`, 'blue')}
                    {statusPill(`Application: ${view.applicationLabel}`, 'gold')}
                    {statusPill(`Evidence: ${view.evidenceCount}`, view.evidenceCount ? 'teal' : 'rose')}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Register:</strong>{' '}
                    {view.register?.legalIdentifier || view.instrument.legalIdentifier || 'Pending legal identifier'}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Obligation / settlement:</strong>{' '}
                    {view.obligation?.title || 'No linked obligation'} / {view.settlement?.status || 'No linked settlement'}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Allocated collateral:</strong>{' '}
                    {view.pledgedItemCount} item{view.pledgedItemCount === 1 ? '' : 's'} | {view.pledgedItemSummary}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Application timeline:</strong>{' '}
                    {view.timelineSummary}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Control notes:</strong>{' '}
                    {view.instrumentSettlement?.applicationSummary ||
                      view.register?.applicationSummary ||
                      view.instrument.applicationProfile?.applicationNotes ||
                      'No application memo recorded yet.'}
                  </div>
                </div>
              </RecordCard>
            ))
          )}
        </div>
      </PageSection>

      <PageSection
        title="Settlement Control Center"
        description="Track how every transaction becomes liquid cash or a verified tokenized movement, and whether the journals actually tie out."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {settlementFlows.map((flow) => (
            <RecordCard
              key={flow.transaction.id}
              title={flow.transaction.title}
              subtitle={`${flow.transaction.type} · ${flow.transaction.status} · ${flow.transaction.date}`}
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => goToHash(resolveSettlementAction(flow).hash)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(126,242,255,0.28)',
                      background: 'rgba(54, 215, 255, 0.09)',
                      color: '#effcff',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    {resolveSettlementAction(flow).label}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {statusPill(
                    flow.settlement
                      ? `Settlement: ${flow.settlement.status}`
                      : 'Settlement missing',
                    flow.settlement ? settlementTone(flow.settlement.status) : 'rose'
                  )}
                  {statusPill(
                    `Auto reconcile: ${flow.derivedAutoReconcileStatus}`,
                    autoStatusTone(flow.derivedAutoReconcileStatus)
                  )}
                  {statusPill(
                    flow.verificationReady ? 'Verified' : 'Verification pending',
                    flow.verificationReady ? 'teal' : 'gold'
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 10,
                    color: 'var(--cf-muted)',
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1 }}>
                      Transaction Amount
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--cf-text)', fontWeight: 700 }}>
                      {formatMoney(flow.transaction.amount, flow.transaction.currency)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1 }}>
                      Liquid Cash Stage
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--cf-text)', fontWeight: 700 }}>
                      {flow.settlement?.liquidCashStage ?? 'unassigned'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1 }}>
                      Settlement Path
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--cf-text)', fontWeight: 700 }}>
                      {flow.settlement?.path ?? 'not linked'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1 }}>
                      Verification Method
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--cf-text)', fontWeight: 700 }}>
                      {flow.settlement?.verificationMethod ?? 'not started'}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: 'var(--cf-muted)',
                    lineHeight: 1.6,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Journal tie-out:</strong>{' '}
                    {formatMoney(flow.journalAmount, flow.transaction.currency)} posted across{' '}
                    {flow.journalEntries.length} entries
                    {flow.journalDelta === 0
                      ? ' with no delta.'
                      : ` with a ${formatMoney(Math.abs(flow.journalDelta), flow.transaction.currency)} delta.`}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Payment / proof:</strong>{' '}
                    {flow.payment
                      ? `${flow.payment.method} ${flow.payment.status}`
                      : flow.onChainRecord
                        ? `${flow.onChainRecord.network} ${flow.onChainRecord.status}`
                        : 'No payment or on-chain proof linked yet.'}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Reconciliation:</strong>{' '}
                    {flow.reconciliation
                      ? `${flow.reconciliation.status}${flow.clearedInReconciliation ? ' and transaction cleared.' : ' but transaction not cleared yet.'}`
                      : 'No bank or statement reconciliation linked yet.'}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Discharge method:</strong>{' '}
                    {flow.settlement?.dischargeMethod ?? 'not designated'}
                  </div>
                  {flow.interEntityTransfer ? (
                    <div>
                      <strong style={{ color: 'var(--cf-text)' }}>Inter-entity rule:</strong>{' '}
                      {flow.interEntityTransfer.settlementMode === 'mirrored_halves'
                        ? `Mirrored half only. ${entityNameById.get(flow.interEntityTransfer.fromEntityId)} and ${entityNameById.get(flow.interEntityTransfer.toEntityId)} each keep their own ledger side.`
                        : 'Cross-entity clearing is explicitly enabled for this movement.'}
                    </div>
                  ) : null}
                  {flow.settlement?.tokenizedProofId ? (
                    <div>
                      <strong style={{ color: 'var(--cf-text)' }}>Tokenized proof:</strong>{' '}
                      {flow.settlement.tokenizedProofId}
                    </div>
                  ) : null}
                  {flow.settlement?.verificationReference ? (
                    <div>
                      <strong style={{ color: 'var(--cf-text)' }}>Control note:</strong>{' '}
                      {flow.settlement.verificationReference}
                    </div>
                  ) : null}
                </div>
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Instrument Settlement Desk"
        description="Track obligations recognized before cash, performance status, and which treasury or bank rail actually discharges the instrument."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.instrumentSettlements.map((record) => (
            <div key={record.id}>
              <RecordEditorCard
                title={record.title}
                subtitle={`${record.dischargeMethod} · ${record.performanceStatus} · ${formatMoney(record.faceAmount, record.currency)}`}
                record={record}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    instrumentSettlements: prev.instrumentSettlements.map((item) =>
                      item.id === record.id ? nextRecord : item
                    ),
                  }))
                }
              />
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 12,
                  background: 'rgba(10, 11, 24, 0.72)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--cf-muted)',
                  lineHeight: 1.6,
                }}
              >
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Legal Identifier:</strong>{' '}
                  {record.legalIdentifier || 'Not assigned'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Source Deposit:</strong>{' '}
                  {record.sourceDepositStatus || 'not tracked'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Obligation Schedules"
        description="Open obligations, recurring performance schedules, and what is expected to be presented or discharged next."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.obligations.map((obligation) => (
            <RecordCard
              key={obligation.id}
              title={obligation.title}
              subtitle={`${obligation.obligationType} · ${obligation.status} · ${formatMoney(obligation.amount, 'USD')}`}
            >
              <div style={{ display: 'grid', gap: 8, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => goToHash(resolveObligationAction(obligation).hash)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(126,242,255,0.28)',
                      background: 'rgba(54, 215, 255, 0.09)',
                      color: '#effcff',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    {resolveObligationAction(obligation).label}
                  </button>
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Legal Identifier:</strong>{' '}
                  {obligation.legalIdentifier || 'Not assigned'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Payment medium:</strong>{' '}
                  {obligation.paymentMedium}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Recurring schedule:</strong>{' '}
                  {obligation.recurringSchedule?.enabled
                    ? `${obligation.recurringSchedule.frequency || 'scheduled'} every ${
                        obligation.recurringSchedule.interval || 1
                      }${obligation.recurringSchedule.nextDueDate ? ` | next ${obligation.recurringSchedule.nextDueDate}` : ''}`
                    : 'Not marked recurring'}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Auto presentment:</strong>{' '}
                  {obligation.recurringSchedule?.autoCreatePresentment ? 'Enabled' : 'Manual'}
                </div>
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Remittance Statements"
        description="Statements and remittance-check style records that evidence performance, with MICR shown only as informational unless the settlement is bank-backed."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.remittanceStatements.map((record) => (
            <RecordCard
              key={record.id}
              title={record.title}
              subtitle={`${record.dischargeMethod} · ${record.status} · ${record.statementDate}`}
            >
              <div style={{ display: 'grid', gap: 8, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => goToHash(resolveRemittanceAction(record).hash)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(126,242,255,0.28)',
                      background: 'rgba(54, 215, 255, 0.09)',
                      color: '#effcff',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    {resolveRemittanceAction(record).label}
                  </button>
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Payer / Payee:</strong>{' '}
                  {record.payerName} {'->'} {record.payeeName}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Amount:</strong>{' '}
                  {formatMoney(record.amount, record.currency)}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>MICR mode:</strong>{' '}
                  {record.micrLine?.mode ?? 'not assigned'}
                  {record.micrLine?.routingNumber ? ` | routing ${record.micrLine.routingNumber}` : ''}
                  {record.micrLine?.accountNumberMask ? ` | acct ****${record.micrLine.accountNumberMask}` : ''}
                </div>
                {record.notes ? (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Control note:</strong> {record.notes}
                  </div>
                ) : null}
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Inter-Entity Transfer Ledger"
        description="Linked entity-to-entity movements are mirrored as paired halves, not one blended reconciliation, unless cross-clearing is explicitly designated."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.interEntityTransfers.map((transfer) => (
            <RecordCard
              key={transfer.id}
              title={`${entityNameById.get(transfer.fromEntityId)} → ${entityNameById.get(transfer.toEntityId)}`}
              subtitle={`${transfer.settlementMode} · ${transfer.status} · ${transfer.effectiveDate}`}
            >
              <div style={{ display: 'grid', gap: 10, color: 'var(--cf-muted)', lineHeight: 1.6 }}>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Amount:</strong>{' '}
                  {formatMoney(transfer.amount, transfer.currency)}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Origin half:</strong> {transfer.fromTransactionId}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Destination half:</strong>{' '}
                  {transfer.toTransactionId}
                </div>
                <div>
                  <strong style={{ color: 'var(--cf-text)' }}>Control rule:</strong>{' '}
                  {transfer.settlementMode === 'mirrored_halves'
                    ? 'Each entity reconciles only its own side of the move.'
                    : 'This transfer is allowed to clear across both entities.'}
                </div>
                {transfer.memo ? (
                  <div>
                    <strong style={{ color: 'var(--cf-text)' }}>Memo:</strong> {transfer.memo}
                  </div>
                ) : null}
              </div>
            </RecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Settlement Records"
        description="Editable settlement-control records driving liquid-cash routing, verification, and tie-out status."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.settlements.map((settlement) => (
            <div key={settlement.id}>
              <RecordEditorCard
                title={`${settlement.path} settlement`}
                subtitle={`${settlement.status} · ${settlement.liquidCashStage} · ${formatMoney(settlement.settledAmount, settlement.currency)}`}
                record={settlement}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    settlements: prev.settlements.map((item) =>
                      item.id === settlement.id ? nextRecord : item
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection title="Ledger-Linked Transactions" description="Editable transaction records.">
        <div style={{ display: 'grid', gap: 16 }}>
          {data.transactions.map((tx) => (
            <div key={tx.id}>
              <RecordEditorCard
                title={tx.title}
                subtitle={`${tx.type} · ${tx.status} · ${tx.date}`}
                record={tx}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    transactions: prev.transactions.map((item) =>
                      item.id === tx.id ? nextRecord : item
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection title="On-Chain Events" description="Editable on-chain event records.">
        <div style={{ display: 'grid', gap: 16 }}>
          {data.onChainTransactions.map((tx) => (
            <div key={tx.id}>
              <RecordEditorCard
                title={tx.eventType}
                subtitle={`${tx.network} · ${tx.status}`}
                record={tx}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    onChainTransactions: prev.onChainTransactions.map((item) =>
                      item.id === tx.id ? nextRecord : item
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
