import type { CoreDataBundle, CreditRailRecord, RailLegalUsePosture } from '../types/core';

export interface PrivateWealthRailSummary {
  railId: string;
  connectionId: string;
  railName: string;
  ownerEntityId: string;
  connectionName: string;
  legalUsePosture: RailLegalUsePosture;
  bankingOperationClass: string;
  overallStatus: 'ready' | 'watch' | 'blocked';
  identifierNamespace: string;
  outstandingExposure: number;
  availableCredit?: number;
  warnings: string[];
}

function inferLegalUsePosture(rail: CreditRailRecord): RailLegalUsePosture {
  if (rail.legalUsePosture) {
    return rail.legalUsePosture;
  }

  if (rail.settlementPath === 'internal_ledger' && rail.reserveBacked) {
    return 'internal_controlled_book_entry';
  }

  if (rail.railType === 'partner_note' || rail.settlementPath === 'tokenized_credit') {
    return 'private_instrument_tracking_only';
  }

  if (rail.settlementPath === 'ach' || rail.settlementPath === 'wire') {
    return 'partner_bank_required_external_presentment';
  }

  return 'hybrid_controlled_settlement';
}

export function buildPrivateWealthRailSummaries(data: CoreDataBundle): PrivateWealthRailSummary[] {
  return (data.creditRails ?? []).map((rail) => {
    const connection = data.entityConnections.find((item) => item.id === rail.entityConnectionId);
    const warnings: string[] = [];

    if (!rail.identifierNamespace) {
      warnings.push('identifier namespace missing');
    }
    if (rail.holderRecordRequired && !rail.autoCreateNoteRemittance) {
      warnings.push('holder records are required but auto note/remittance is off');
    }
    if (rail.reserveBacked && !rail.linkedTreasuryAccountId) {
      warnings.push('reserve-backed rail has no treasury account linked');
    }
    if (rail.autoIssueTokens && !(rail.linkedTokenIds?.length)) {
      warnings.push('verification token support expected but no linked token is on the rail');
    }
    if (connection?.requireComplianceValidation && rail.status === 'active') {
      warnings.push('compliance validation is required for this connection');
    }

    const overallStatus =
      rail.status === 'blocked'
        ? 'blocked'
        : rail.status === 'watch' || warnings.length
          ? 'watch'
          : 'ready';

    return {
      railId: rail.id,
      connectionId: rail.entityConnectionId,
      railName: rail.railName,
      ownerEntityId: rail.ownerEntityId,
      connectionName: connection?.connectionName || 'Unlinked connection',
      legalUsePosture: inferLegalUsePosture(rail),
      bankingOperationClass: rail.bankingOperationClass || 'general_settlement',
      overallStatus,
      identifierNamespace: rail.identifierNamespace || 'namespace not assigned',
      outstandingExposure: Number(rail.outstandingExposure ?? 0),
      availableCredit: rail.availableCredit,
      warnings,
    };
  });
}
