import type {
  CoreDataBundle,
  ObligationLifecycleStage,
  ObligationRecord,
} from '../types/core';

export interface ObligationLifecycleSummary {
  obligation: ObligationRecord;
  stage: ObligationLifecycleStage;
  presentmentCount: number;
  settledAmount: number;
  outstandingAmount: number;
  linkedCouponPresentment?: CoreDataBundle['couponPresentments'][number];
  linkedRemittanceStatement?: CoreDataBundle['remittanceStatements'][number];
  linkedSettlement?: CoreDataBundle['settlements'][number];
  linkedInstrumentSettlement?: CoreDataBundle['instrumentSettlements'][number];
  linkedRegister?: CoreDataBundle['negotiableInstrumentRegisters'][number];
  canPresent: boolean;
  canStartCure: boolean;
  canDeclareDefault: boolean;
  canDischarge: boolean;
  watchItems: string[];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isOnOrBefore(left?: string, right?: string) {
  if (!left || !right) return false;
  return left <= right;
}

function deriveStage(
  obligation: ObligationRecord,
  presentment?: CoreDataBundle['couponPresentments'][number],
  settlement?: CoreDataBundle['settlements'][number],
  instrumentSettlement?: CoreDataBundle['instrumentSettlements'][number]
): ObligationLifecycleStage {
  if (obligation.lifecycleStage) {
    return obligation.lifecycleStage;
  }

  if (obligation.status === 'satisfied') {
    return 'discharged';
  }

  if (obligation.status === 'defaulted') {
    return 'defaulted';
  }

  if (instrumentSettlement?.performanceStatus === 'performed' || settlement?.status === 'settled') {
    return 'discharge_pending';
  }

  if (presentment?.status === 'performed') {
    return 'discharge_pending';
  }

  if (presentment?.status === 'presented' || presentment?.status === 'accepted') {
    return 'presented';
  }

  if (obligation.recurringSchedule?.nextDueDate && isOnOrBefore(obligation.recurringSchedule.nextDueDate, todayIso())) {
    return 'presentment_due';
  }

  return 'recognized';
}

export function buildObligationLifecycleSummaries(
  data: CoreDataBundle
): ObligationLifecycleSummary[] {
  return data.obligations.map((obligation) => {
    const presentments = data.couponPresentments.filter(
      (item) => item.obligationId === obligation.id
    );
    const linkedCouponPresentment =
      presentments.sort((left, right) => right.presentmentDate.localeCompare(left.presentmentDate))[0];
    const linkedRemittanceStatement =
      data.remittanceStatements.find((item) =>
        item.linkedObligationIds?.includes(obligation.id)
      ) ||
      (linkedCouponPresentment?.linkedRemittanceStatementId
        ? data.remittanceStatements.find(
            (item) => item.id === linkedCouponPresentment.linkedRemittanceStatementId
          )
        : undefined);
    const linkedInstrumentSettlement =
      data.instrumentSettlements.find((item) => item.obligationId === obligation.id) ||
      (linkedCouponPresentment?.instrumentSettlementId
        ? data.instrumentSettlements.find(
            (item) => item.id === linkedCouponPresentment.instrumentSettlementId
          )
        : undefined);
    const linkedSettlement =
      data.settlements.find((item) =>
        obligation.linkedSettlementIds?.includes(item.id)
      ) ||
      (linkedCouponPresentment?.linkedSettlementId
        ? data.settlements.find((item) => item.id === linkedCouponPresentment.linkedSettlementId)
        : undefined) ||
      (linkedInstrumentSettlement?.linkedSettlementId
        ? data.settlements.find((item) => item.id === linkedInstrumentSettlement.linkedSettlementId)
        : undefined);
    const linkedRegister = data.negotiableInstrumentRegisters.find(
      (item) =>
        item.obligationId === obligation.id ||
        obligation.linkedInstrumentIds?.includes(item.instrumentId || '')
    );

    const performedAmount =
      linkedInstrumentSettlement?.performedAmount ??
      (linkedSettlement?.status === 'settled' ? linkedSettlement.settledAmount : 0);
    const settledAmount = Math.min(obligation.amount, performedAmount);
    const outstandingAmount = Math.max(0, Number((obligation.amount - settledAmount).toFixed(2)));
    const stage = deriveStage(
      obligation,
      linkedCouponPresentment,
      linkedSettlement,
      linkedInstrumentSettlement
    );

    const watchItems: string[] = [];
    if (!obligation.legalIdentifier) {
      watchItems.push('Legal identifier not assigned.');
    }
    if (!linkedRegister && obligation.linkedInstrumentIds?.length) {
      watchItems.push('No negotiable-instrument register linked.');
    }
    if (stage === 'presentment_due') {
      watchItems.push('Presentment due now.');
    }
    if (stage === 'cure_running' && obligation.cureDeadline) {
      watchItems.push(`Cure deadline ${obligation.cureDeadline}.`);
    }
    if (stage === 'discharge_pending' && !linkedSettlement) {
      watchItems.push('Discharge pending but no settlement record linked.');
    }

    return {
      obligation,
      stage,
      presentmentCount: presentments.length,
      settledAmount,
      outstandingAmount,
      linkedCouponPresentment,
      linkedRemittanceStatement,
      linkedSettlement,
      linkedInstrumentSettlement,
      linkedRegister,
      canPresent:
        obligation.status === 'open' &&
        stage !== 'defaulted' &&
        stage !== 'discharged' &&
        stage !== 'cure_running',
      canStartCure:
        obligation.status === 'open' &&
        stage !== 'cure_running' &&
        stage !== 'defaulted' &&
        stage !== 'discharged' &&
        !!linkedCouponPresentment,
      canDeclareDefault:
        obligation.status !== 'satisfied' &&
        stage !== 'defaulted' &&
        stage !== 'discharged' &&
        (!!linkedCouponPresentment || !!obligation.cureDeadline),
      canDischarge:
        obligation.status !== 'satisfied' &&
        (outstandingAmount === 0 ||
          linkedInstrumentSettlement?.performanceStatus === 'performed' ||
          linkedSettlement?.status === 'settled'),
      watchItems,
    };
  });
}
