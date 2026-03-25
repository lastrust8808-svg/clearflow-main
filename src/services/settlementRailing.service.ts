import type {
  BankAccountRecord,
  CoreDataBundle,
  MovementIdentifierRecord,
  PaymentRecord,
  RailNamespace,
  ReclamationEventRecord,
  ReturnEventRecord,
  SettlementRecord,
  TaxReportingLinkRecord,
  TokenRecord,
  TreasuryAccountRecord,
  VendorRecord,
  WalletRecord,
} from '../types/core';

export type SettlementRailCheckStatus = 'pass' | 'watch' | 'hold' | 'exception';
export type SettlementRailOverallStatus = 'ready' | 'watch' | 'hold' | 'exception';

export interface SettlementRailCheck {
  id:
    | 'source_control'
    | 'counterparty_instruction'
    | 'control_authority'
    | 'proof_token'
    | 'movement_trace'
    | 'exception_desk'
    | 'tax_and_reconcile';
  label: string;
  status: SettlementRailCheckStatus;
  detail: string;
}

export interface SettlementRailControlView {
  paymentId: string;
  settlementId?: string;
  railNamespace: RailNamespace | 'digital_asset_wallet' | 'internal_private_reserve';
  executionLabel: string;
  overallStatus: SettlementRailOverallStatus;
  recommendedAction: string;
  checks: SettlementRailCheck[];
  blockers: string[];
  watchItems: string[];
  passCount: number;
  movementIdentifierCount: number;
  openReturnCount: number;
  openReclamationCount: number;
  taxReviewState: 'not_applicable' | 'clear' | 'watch';
}

function isOutgoingRemittance(payment: PaymentRecord) {
  return (
    payment.direction === 'outgoing' &&
    payment.counterpartyType === 'vendor' &&
    (payment.method === 'ach' || payment.method === 'wire' || payment.method === 'digital_asset')
  );
}

function toOverallStatus(statuses: SettlementRailCheckStatus[]): SettlementRailOverallStatus {
  if (statuses.includes('exception')) {
    return 'exception';
  }

  if (statuses.includes('hold')) {
    return 'hold';
  }

  if (statuses.includes('watch')) {
    return 'watch';
  }

  return 'ready';
}

function inferRailNamespace(payment: PaymentRecord, settlement?: SettlementRecord): SettlementRailControlView['railNamespace'] {
  if (payment.method === 'wire') {
    return 'fedwire';
  }

  if (payment.method === 'ach') {
    return 'commercial_ach';
  }

  if (payment.method === 'digital_asset') {
    return 'digital_asset_wallet';
  }

  if (settlement?.path === 'internal_ledger') {
    return 'internal_private_reserve';
  }

  return 'commercial_ach';
}

function inferExecutionLabel(payment: PaymentRecord, settlement?: SettlementRecord) {
  if (payment.method === 'digital_asset') {
    return settlement?.executionRail || 'Wallet execution';
  }

  return (
    settlement?.executionRail ||
    payment.settlementExecution?.executionRail ||
    (payment.method === 'wire' ? 'Fedwire' : 'StandardACH')
  );
}

function evaluateSourceControl(
  payment: PaymentRecord,
  bankAccount: BankAccountRecord | undefined,
  treasuryAccount: TreasuryAccountRecord | undefined,
  wallet: WalletRecord | undefined,
) : SettlementRailCheck {
  if (payment.method === 'digital_asset') {
    if (!wallet) {
      return {
        id: 'source_control',
        label: 'Source control',
        status: 'hold',
        detail: 'No connected wallet source is assigned for this digital-asset settlement.',
      };
    }

    if (wallet.executionSupport === 'read_only') {
      return {
        id: 'source_control',
        label: 'Source control',
        status: 'hold',
        detail: `${wallet.name} is read-only and cannot release payouts.`,
      };
    }

    if (wallet.executionSupport === 'manual_release') {
      return {
        id: 'source_control',
        label: 'Source control',
        status: 'watch',
        detail: `${wallet.name} is in controlled manual-release mode on ${wallet.network}.`,
      };
    }

    return {
      id: 'source_control',
      label: 'Source control',
      status: 'pass',
      detail: `${wallet.name} is connected for live wallet execution on ${wallet.network}.`,
    };
  }

  if (bankAccount) {
    if (bankAccount.status !== 'active') {
      return {
        id: 'source_control',
        label: 'Source control',
        status: 'hold',
        detail: `${bankAccount.accountName} is not active for settlement release.`,
      };
    }

    if (payment.method === 'ach' && bankAccount.achOriginationEnabled === false) {
      return {
        id: 'source_control',
        label: 'Source control',
        status: 'hold',
        detail: `${bankAccount.accountName} is not enabled for ACH origination.`,
      };
    }

    if (payment.method === 'wire' && bankAccount.wireEnabled === false) {
      return {
        id: 'source_control',
        label: 'Source control',
        status: 'hold',
        detail: `${bankAccount.accountName} is not enabled for wire release.`,
      };
    }

    if (bankAccount.liveFeedEnabled && bankAccount.liveFeedStatus !== 'connected') {
      return {
        id: 'source_control',
        label: 'Source control',
        status: 'watch',
        detail: `${bankAccount.accountName} is funding the settlement, but the live feed is not fully connected.`,
      };
    }

    return {
      id: 'source_control',
      label: 'Source control',
      status: 'pass',
      detail: `${bankAccount.accountName} is active and mapped for ${payment.method.toUpperCase()} release.`,
    };
  }

  if (treasuryAccount) {
    if (treasuryAccount.status !== 'active') {
      return {
        id: 'source_control',
        label: 'Source control',
        status: 'hold',
        detail: `${treasuryAccount.name} is not active for remittance release.`,
      };
    }

    if (!treasuryAccount.remittanceEnabled) {
      return {
        id: 'source_control',
        label: 'Source control',
        status: 'hold',
        detail: `${treasuryAccount.name} is not remittance-enabled.`,
      };
    }

    if ((treasuryAccount.availableBalance ?? 0) < payment.amount) {
      return {
        id: 'source_control',
        label: 'Source control',
        status: 'hold',
        detail: `${treasuryAccount.name} does not show enough available balance for this settlement.`,
      };
    }

    return {
      id: 'source_control',
      label: 'Source control',
      status: 'pass',
      detail: `${treasuryAccount.name} is funding this movement through the private reserve or treasury lane.`,
    };
  }

  return {
    id: 'source_control',
    label: 'Source control',
    status: 'hold',
    detail: 'No bank, treasury, or wallet source is linked to this settlement.',
  };
}

function evaluateCounterpartyInstruction(
  payment: PaymentRecord,
  vendor: VendorRecord | undefined,
) : SettlementRailCheck {
  if (!vendor) {
    return {
      id: 'counterparty_instruction',
      label: 'Counterparty instruction',
      status: 'hold',
      detail: 'The vendor record is missing, so remittance instructions cannot be validated.',
    };
  }

  if (payment.method === 'digital_asset') {
    if (!vendor.paymentInstructions?.digitalWalletAddress) {
      return {
        id: 'counterparty_instruction',
        label: 'Counterparty instruction',
        status: 'hold',
        detail: `${vendor.name} does not have a digital wallet destination on file.`,
      };
    }

    if (!vendor.paymentInstructions?.digitalWalletNetwork) {
      return {
        id: 'counterparty_instruction',
        label: 'Counterparty instruction',
        status: 'watch',
        detail: `${vendor.name} has a wallet address on file, but the network is not explicitly set.`,
      };
    }

    return {
      id: 'counterparty_instruction',
      label: 'Counterparty instruction',
      status: 'pass',
      detail: `${vendor.name} has a digital payout destination and network on file.`,
    };
  }

  const instructions = vendor.paymentInstructions;
  if (!instructions?.routingNumber || !instructions?.accountNumber || !instructions?.beneficiaryName) {
    return {
      id: 'counterparty_instruction',
      label: 'Counterparty instruction',
      status: 'hold',
      detail: `${vendor.name} is missing required beneficiary or bank instruction fields.`,
    };
  }

  if (instructions.verificationStatus === 'invalid') {
    return {
      id: 'counterparty_instruction',
      label: 'Counterparty instruction',
      status: 'exception',
      detail: `${vendor.name} has invalid bank instructions flagged on the vendor profile.`,
    };
  }

  if (instructions.verificationStatus !== 'verified') {
    return {
      id: 'counterparty_instruction',
      label: 'Counterparty instruction',
      status: 'watch',
      detail: `${vendor.name} has bank instructions on file, but they are not yet fully verified.`,
    };
  }

  return {
    id: 'counterparty_instruction',
    label: 'Counterparty instruction',
    status: 'pass',
    detail: `${vendor.name} has verified remittance instructions on file.`,
  };
}

function evaluateControlAuthority(payment: PaymentRecord): SettlementRailCheck {
  if (payment.complianceConfirmationStatus === 'pending') {
    return {
      id: 'control_authority',
      label: 'Control authority',
      status: 'hold',
      detail: 'Compliance confirmation is still pending before release can continue.',
    };
  }

  if (
    payment.releaseStatus !== 'released' &&
    payment.approvalStatus !== 'approved' &&
    payment.approvalStatus !== 'not_required'
  ) {
    return {
      id: 'control_authority',
      label: 'Control authority',
      status: 'hold',
      detail: 'Remittance approval has not been completed yet.',
    };
  }

  if (payment.releaseStatus === 'released') {
    return {
      id: 'control_authority',
      label: 'Control authority',
      status: 'pass',
      detail: `Released by ${payment.releasedBy || 'the acting authority'} on ${payment.releasedAt || 'the current cycle'}.`,
    };
  }

  return {
    id: 'control_authority',
    label: 'Control authority',
    status: 'pass',
    detail: 'Compliance and approval controls are satisfied for the current release stage.',
  };
}

function evaluateProofToken(
  payment: PaymentRecord,
  settlement: SettlementRecord | undefined,
  tokens: TokenRecord[],
) : SettlementRailCheck {
  const linkedTokenIds = [
    ...(settlement?.linkedTokenIds || []),
    ...(payment.releaseTokenId ? [payment.releaseTokenId] : []),
  ];
  const linkedTokens = tokens.filter((token) => linkedTokenIds.includes(token.id));

  if (!linkedTokens.length) {
    return {
      id: 'proof_token',
      label: 'Proof and token posture',
      status: 'watch',
      detail: 'No explicit release token is linked yet; the settlement is relying on non-token proof controls.',
    };
  }

  const verifiedToken = linkedTokens.find((token) => token.status === 'verified');
  if (verifiedToken) {
    return {
      id: 'proof_token',
      label: 'Proof and token posture',
      status: 'pass',
      detail: `${linkedTokens.length} linked token control(s) are present, including verified proof.`,
    };
  }

  return {
    id: 'proof_token',
    label: 'Proof and token posture',
    status: 'watch',
    detail: `${linkedTokens.length} linked token control(s) exist, but final verification is still pending.`,
  };
}

function evaluateMovementTrace(
  payment: PaymentRecord,
  settlement: SettlementRecord | undefined,
  movementIdentifiers: MovementIdentifierRecord[],
) : SettlementRailCheck {
  const linkedMovementIdentifiers = movementIdentifiers.filter(
    (record) =>
      record.linkedPaymentId === payment.id ||
      (settlement ? record.linkedSettlementId === settlement.id : false),
  );

  if (payment.method === 'digital_asset') {
    return {
      id: 'movement_trace',
      label: 'Movement trace',
      status: payment.linkedOnChainTransactionId ? 'pass' : 'watch',
      detail: payment.linkedOnChainTransactionId
        ? 'Linked on-chain transaction record is present for wallet traceability.'
        : 'Digital-asset release has not yet produced a linked on-chain trace record.',
    };
  }

  if (!linkedMovementIdentifiers.length) {
    return {
      id: 'movement_trace',
      label: 'Movement trace',
      status: 'hold',
      detail: 'No ACH, Fedwire, coupon, or reporting movement identifier is linked to this settlement.',
    };
  }

  return {
    id: 'movement_trace',
    label: 'Movement trace',
    status: 'pass',
    detail: `${linkedMovementIdentifiers.length} movement identifier record(s) are linked for rail traceability.`,
  };
}

function evaluateExceptions(
  settlement: SettlementRecord | undefined,
  returnEvents: ReturnEventRecord[],
  reclamationEvents: ReclamationEventRecord[],
) : SettlementRailCheck {
  const hasProcessorException =
    settlement?.processorStatus === 'blocked' ||
    settlement?.processorStatus === 'requires_review' ||
    settlement?.status === 'exception' ||
    settlement?.verificationStatus === 'exception';
  const openReturnCount = returnEvents.filter((event) => event.status !== 'resolved').length;
  const openReclamationCount = reclamationEvents.filter((event) => event.status !== 'resolved').length;

  if (hasProcessorException || openReturnCount || openReclamationCount) {
    return {
      id: 'exception_desk',
      label: 'Exception desk',
      status: hasProcessorException ? 'exception' : 'hold',
      detail: `Open exception posture: ${openReturnCount} return(s), ${openReclamationCount} reclamation(s), processor status ${settlement?.processorStatus || 'n/a'}.`,
    };
  }

  return {
    id: 'exception_desk',
    label: 'Exception desk',
    status: 'pass',
    detail: 'No open return, reclamation, or processor exception is attached to this settlement.',
  };
}

function evaluateTaxAndReconcile(
  payment: PaymentRecord,
  settlement: SettlementRecord | undefined,
  taxReportingLink: TaxReportingLinkRecord | undefined,
) : SettlementRailCheck {
  if (settlement?.autoReconcileStatus === 'exception') {
    return {
      id: 'tax_and_reconcile',
      label: 'Tax and reconciliation',
      status: 'hold',
      detail: 'Settlement auto-reconciliation is in exception status and must be resolved before the rail is considered clean.',
    };
  }

  if (
    taxReportingLink &&
    (taxReportingLink.tinMatchStatus === 'pending' ||
      taxReportingLink.tinMatchStatus === 'mismatch' ||
      taxReportingLink.correctionStatus === 'pending')
  ) {
    return {
      id: 'tax_and_reconcile',
      label: 'Tax and reconciliation',
      status: 'watch',
      detail: `${taxReportingLink.counterpartyName} still has filing or TIN review pending in the 1099 lane.`,
    };
  }

  return {
    id: 'tax_and_reconcile',
    label: 'Tax and reconciliation',
    status: 'pass',
    detail:
      settlement?.autoReconcileStatus === 'matched'
        ? 'Reconciliation posture is matched and no tax review issue is open.'
        : 'No tax or reconciliation blocker is open on this settlement.',
  };
}

function buildRecommendedAction(overallStatus: SettlementRailOverallStatus, checks: SettlementRailCheck[]) {
  if (overallStatus === 'exception') {
    return 'Clear the processor or return exception before any further release movement.';
  }

  if (overallStatus === 'hold') {
    const holdCheck = checks.find((check) => check.status === 'hold');
    return holdCheck?.detail || 'Resolve the blocking rail control before release.';
  }

  if (overallStatus === 'watch') {
    const watchCheck = checks.find((check) => check.status === 'watch');
    return watchCheck?.detail || 'Release can continue, but there is still follow-up work to clear.';
  }

  return 'Rail controls are lined up for clean release and settlement traceability.';
}

export function buildRemittanceRailControls(data: CoreDataBundle): SettlementRailControlView[] {
  return data.payments
    .filter(isOutgoingRemittance)
    .map((payment) => {
      const settlement = payment.linkedSettlementId
        ? data.settlements.find((item) => item.id === payment.linkedSettlementId)
        : undefined;
      const vendor = payment.counterpartyId
        ? data.vendors.find((item) => item.id === payment.counterpartyId)
        : undefined;
      const bankAccount = payment.sourceBankAccountId
        ? data.bankAccounts.find((item) => item.id === payment.sourceBankAccountId)
        : undefined;
      const treasuryAccount = payment.treasuryAccountId
        ? data.treasuryAccounts.find((item) => item.id === payment.treasuryAccountId)
        : undefined;
      const wallet = payment.linkedWalletId
        ? data.wallets.find((item) => item.id === payment.linkedWalletId)
        : undefined;
      const linkedMovementIdentifiers = data.movementIdentifiers.filter(
        (record) =>
          record.linkedPaymentId === payment.id ||
          (settlement ? record.linkedSettlementId === settlement.id : false),
      );
      const linkedReturnEvents = data.returnEvents.filter(
        (event) =>
          event.linkedPaymentId === payment.id ||
          (settlement ? event.linkedSettlementId === settlement.id : false) ||
          linkedMovementIdentifiers.some((record) => record.id === event.linkedMovementIdentifierId),
      );
      const linkedReclamations = data.reclamationEvents.filter((event) =>
        linkedMovementIdentifiers.some((record) => record.id === event.linkedMovementIdentifierId),
      );
      const taxReportingLink = data.taxReportingLinks.find((item) => item.linkedPaymentId === payment.id);

      const checks = [
        evaluateSourceControl(payment, bankAccount, treasuryAccount, wallet),
        evaluateCounterpartyInstruction(payment, vendor),
        evaluateControlAuthority(payment),
        evaluateProofToken(payment, settlement, data.tokens),
        evaluateMovementTrace(payment, settlement, data.movementIdentifiers),
        evaluateExceptions(settlement, linkedReturnEvents, linkedReclamations),
        evaluateTaxAndReconcile(payment, settlement, taxReportingLink),
      ];

      const overallStatus = toOverallStatus(checks.map((check) => check.status));

      return {
        paymentId: payment.id,
        settlementId: settlement?.id,
        railNamespace: inferRailNamespace(payment, settlement),
        executionLabel: inferExecutionLabel(payment, settlement),
        overallStatus,
        recommendedAction: buildRecommendedAction(overallStatus, checks),
        checks,
        blockers: checks
          .filter((check) => check.status === 'hold' || check.status === 'exception')
          .map((check) => check.detail),
        watchItems: checks.filter((check) => check.status === 'watch').map((check) => check.detail),
        passCount: checks.filter((check) => check.status === 'pass').length,
        movementIdentifierCount: linkedMovementIdentifiers.length,
        openReturnCount: linkedReturnEvents.filter((item) => item.status !== 'resolved').length,
        openReclamationCount: linkedReclamations.filter((item) => item.status !== 'resolved').length,
        taxReviewState: taxReportingLink
          ? taxReportingLink.tinMatchStatus === 'matched' && taxReportingLink.correctionStatus !== 'pending'
            ? 'clear'
            : 'watch'
          : 'not_applicable',
      };
    });
}

export function getRemittanceRailControl(
  data: CoreDataBundle,
  paymentId: string,
): SettlementRailControlView | undefined {
  return buildRemittanceRailControls(data).find((control) => control.paymentId === paymentId);
}

export function hasHardRailBlocks(
  control: SettlementRailControlView | undefined,
  ignoredCheckIds: SettlementRailCheck['id'][] = [],
) {
  if (!control) {
    return false;
  }

  return control.checks.some(
    (check) =>
      !ignoredCheckIds.includes(check.id) &&
      (check.status === 'hold' || check.status === 'exception'),
  );
}
