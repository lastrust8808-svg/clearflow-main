import { randomUUID } from 'node:crypto';
import { decideRail } from '../policy/railPolicy.js';
import { isValidRoutingNumber } from '../utils/routingValidator.js';

function hasValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function isPlaidTransferConfigured() {
  return hasValue(process.env.PLAID_CLIENT_ID) && hasValue(process.env.PLAID_SECRET);
}

function getPlaidEnvironment() {
  return (process.env.PLAID_ENV || 'sandbox').toLowerCase();
}

function getExecutionMode() {
  return getPlaidEnvironment() === 'production' ? 'live' : 'staged';
}

function detectProvider() {
  if (isPlaidTransferConfigured()) {
    return 'plaid';
  }
  return 'manual';
}

function detectPayeeType({ vendorInstruction, vendorReceiveMethod }) {
  if (vendorReceiveMethod === 'lockbox_coupon') {
    return 'biller_direct';
  }

  if (
    hasValue(vendorInstruction?.routingNumber) &&
    hasValue(vendorInstruction?.accountNumber)
  ) {
    return 'bank_payee';
  }

  return 'manual_payee';
}

export function buildExecutionCapabilities() {
  const provider = detectProvider();
  const plaidEnvironment = getPlaidEnvironment();
  const executionMode = getExecutionMode();
  const plaidLiveReady = provider === 'plaid' && plaidEnvironment === 'production';

  return {
    provider,
    executionMode,
    plaidEnvironment,
    liveBankExecutionReady: plaidLiveReady,
    achOriginationReady: plaidLiveReady,
    wireOriginationReady: false,
    billerDirectReady: false,
    printableCheckReady: true,
    positivePayReady: true,
    supportedPayeeTypes: ['bank_payee', 'manual_payee', 'biller_direct'],
    supportedMethods: plaidLiveReady ? ['ach', 'check'] : ['check'],
    notes: plaidLiveReady
      ? [
          'Live bank aggregation is configured.',
          'True bank-originated execution should still be treated as provider-scoped and trace-driven.',
          'Printable check and Positive Pay support records can be generated as staged execution artifacts when the source account permits check issue.',
          'Biller-direct utility execution still requires a dedicated biller or bank-bill-pay rail.',
        ]
      : [
          'Execution is not in a fully live provider-backed mode.',
          'Bank feeds may be connected while outbound execution remains staged.',
          'Printable check and Positive Pay support records can still be generated as staged execution artifacts when the source account permits check issue.',
          'Biller-direct utility execution still requires a dedicated biller or bank-bill-pay rail.',
        ],
  };
}

export function buildSettlementExecution({
  entityId,
  paymentId,
  settlementId,
  amount,
  currency,
  direction,
  method,
  urgency,
  sourceBankAccount,
  sourceLedgerAccount,
  vendorInstruction,
  vendorReceiveMethod,
}) {
  const capabilities = buildExecutionCapabilities();
  const provider = capabilities.provider;
  const executionMode = capabilities.executionMode;
  const payeeType = detectPayeeType({ vendorInstruction, vendorReceiveMethod });
  const routingNumber = vendorInstruction?.routingNumber || '';
  const accountNumber = vendorInstruction?.accountNumber || '';
  const vendorInstructionVerified =
    isValidRoutingNumber(routingNumber) && /^\d{4,17}$/.test(accountNumber);

  const sourceType = sourceBankAccount
    ? 'bank_account'
    : sourceLedgerAccount
      ? 'ledger_account'
      : 'manual_remittance';

  let rail = 'None';
  let executionReason = 'No settlement rail available.';
  let processorStatus = 'blocked';
  let verificationStatus = 'exception';
  let verificationMethod = 'manual_override';
  let externalStatus = 'draft';
  let liveExecution = false;

  if (
    sourceType === 'ledger_account' &&
    sourceLedgerAccount &&
    sourceLedgerAccount.remittanceEligible === false
  ) {
    executionReason = 'Selected ledger account is not approved for remittance execution.';
    rail = 'LedgerRemittance';
    processorStatus = 'requires_review';
    externalStatus = 'manual_review';
  } else if (direction === 'outgoing' && payeeType === 'biller_direct') {
    rail =
      method === 'wire'
        ? 'Fedwire'
        : method === 'ach'
          ? 'StandardACH'
          : method === 'check'
            ? 'CheckIssue'
            : 'None';
    processorStatus = 'requires_review';
    verificationStatus = 'pending';
    verificationMethod = sourceType === 'ledger_account' ? 'internal_control_token' : 'bank_confirmation';
    externalStatus = 'manual_review';
    executionReason =
      'Payee is operating as a biller-direct or lockbox counterparty. ClearFlow retained the remittance and settlement controls, but this payee still needs a dedicated biller-direct or bank-bill-pay execution rail.';
  } else if (direction === 'outgoing' && method === 'check' && sourceBankAccount) {
    rail = 'CheckIssue';
    processorStatus = sourceBankAccount.checkDraftEnabled === false ? 'requires_review' : 'queued';
    verificationStatus = 'pending';
    verificationMethod =
      sourceBankAccount.positivePayEnabled === false ? 'manual_override' : 'bank_confirmation';
    externalStatus = 'staged';
    executionReason =
      sourceBankAccount.checkDraftEnabled === false
        ? 'Source bank account is not approved for printable check issue yet.'
        : `Printable check issue can be generated against ${sourceBankAccount.accountName}. ${
            sourceBankAccount.positivePayEnabled === false
              ? 'Positive Pay is not enabled on this account, so the check should stay in manual review before release.'
              : 'Positive Pay support can be prepared so the issued-check record can be matched when the item is presented.'
          }${
            sourceBankAccount.overdraftPolicy === 'bank_authorized'
              ? ' This source account is marked as bank-authorized for overdraft-backed fulfillment.'
              : sourceBankAccount.overdraftPolicy === 'controlled_sweep'
                ? ' This source account is marked for controlled sweep / liquidity support before return risk.'
                : ''
          } Delivery and presentment still require mail or a dedicated check processor.`;
  } else if (direction === 'outgoing' && (method === 'ach' || method === 'wire') && vendorInstructionVerified) {
    const policyDecision = decideRail({
      payee: {
        routingNumber,
        accountNumber,
        name: vendorInstruction?.beneficiaryName || vendorInstruction?.bankName || 'Vendor Payee',
      },
      amount: Number(amount),
      urgency:
        method === 'wire'
          ? 'final'
          : urgency === 'instant' || urgency === 'same_day' || urgency === 'standard' || urgency === 'final'
            ? urgency
            : 'standard',
      risk: {
        signalDecision: null,
      },
      userPreference:
        method === 'wire'
          ? 'Fedwire'
          : vendorInstruction?.railPreference === 'wire'
            ? 'Fedwire'
            : vendorInstruction?.railPreference === 'eft'
              ? 'SameDayACH'
              : urgency === 'same_day'
                ? 'SameDayACH'
                : undefined,
    });

    rail = sourceType === 'ledger_account' && policyDecision.rail !== 'None'
      ? 'LedgerRemittance'
      : policyDecision.rail;
    executionReason =
      sourceType === 'ledger_account'
        ? `Ledger remittance proxy selected. ${policyDecision.reason}`
        : policyDecision.reason;
    verificationStatus = 'pending';
    verificationMethod =
      sourceType === 'ledger_account' ? 'internal_control_token' : 'bank_confirmation';

    if (method === 'ach' && capabilities.achOriginationReady && sourceType === 'bank_account') {
      processorStatus = 'queued';
      externalStatus = 'submitted';
      liveExecution = true;
      executionReason = `${executionReason} Execution provider ${provider} accepted the ACH instruction for submission.`;
    } else if (method === 'wire' && capabilities.wireOriginationReady && sourceType === 'bank_account') {
      processorStatus = 'queued';
      externalStatus = 'submitted';
      liveExecution = true;
      executionReason = `${executionReason} Execution provider ${provider} accepted the wire instruction for submission.`;
    } else if (sourceType === 'ledger_account') {
      processorStatus = 'queued';
      externalStatus = 'staged';
      executionReason = `${executionReason} Settlement is still staged through internal ledger control until an external rail is released.`;
    } else {
      processorStatus = 'requires_review';
      externalStatus = 'manual_review';
      executionReason = `${executionReason} A live external execution provider is not enabled for this rail yet.`;
    }
  } else if (direction === 'outgoing' && (method === 'ach' || method === 'wire')) {
    rail = method === 'wire' ? 'Fedwire' : 'StandardACH';
    executionReason = 'Vendor bank instructions are incomplete or invalid.';
    processorStatus = 'requires_review';
    verificationStatus = 'exception';
    verificationMethod = 'manual_override';
    externalStatus = 'manual_review';
  } else if (direction === 'incoming') {
    rail = method === 'wire' ? 'Fedwire' : method === 'ach' ? 'StandardACH' : 'None';
    executionReason = 'Incoming settlement recorded for verification and remittance tracking.';
    processorStatus = rail === 'None' ? 'queued' : 'processing';
    verificationStatus = 'pending';
    verificationMethod = 'bank_confirmation';
    externalStatus = 'submitted';
  }

  if (
    sourceType === 'bank_account' &&
    method === 'ach' &&
    sourceBankAccount &&
    sourceBankAccount.achOriginationEnabled === false
  ) {
    processorStatus = 'requires_review';
    externalStatus = 'manual_review';
    liveExecution = false;
    executionReason = 'Source bank account is present but ACH origination is not enabled.';
  }

  if (
    sourceType === 'bank_account' &&
    method === 'wire' &&
    sourceBankAccount &&
    sourceBankAccount.wireEnabled === false
  ) {
    processorStatus = 'requires_review';
    externalStatus = 'manual_review';
    liveExecution = false;
    executionReason = 'Source bank account is present but wire origination is not enabled.';
  }

  return {
    id: randomUUID(),
    entityId,
    paymentId,
    settlementId,
    amount: Number(amount),
    currency: currency || 'USD',
    rail,
    processorStatus,
    verificationStatus,
    verificationMethod,
    executionReason,
    executionReference: `SET-${Date.now()}`,
    sourceType,
    vendorInstructionVerified,
    simulatedProcessing: !liveExecution,
    liveExecution,
    executionMode,
    executionProvider: provider,
    payeeType,
    externalStatus,
    createdAt: new Date().toISOString(),
  };
}
