import { randomUUID } from 'node:crypto';
import { decideRail } from '../policy/railPolicy.js';
import { isValidRoutingNumber } from '../utils/routingValidator.js';
import {
  isMercuryExecutionConfigured,
  queueMercuryPaymentApproval,
} from './mercuryExecution.js';

function hasValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function getPlaidEnvironment() {
  return (process.env.PLAID_ENV || 'sandbox').toLowerCase();
}

function isMercurySource(sourceBankAccount) {
  return String(sourceBankAccount?.institutionName || '')
    .trim()
    .toLowerCase()
    .includes('mercury');
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

function resolveFundsApplicationClass({
  method,
  payeeType,
  fundsRightsClassification,
}) {
  if (method === 'check') {
    return 'check_issue';
  }

  if (payeeType === 'biller_direct') {
    return 'biller_direct_review';
  }

  if (fundsRightsClassification === 'consumer_household') {
    return 'consumer_ppd';
  }

  if (fundsRightsClassification === 'commercial_business') {
    return 'commercial_ccd';
  }

  if (fundsRightsClassification === 'fiduciary_administrative') {
    return 'fiduciary_admin';
  }

  return 'manual_review';
}

export function buildExecutionCapabilities() {
  const mercuryApprovalReady = isMercuryExecutionConfigured();

  return {
    provider: mercuryApprovalReady ? 'mercury' : 'manual',
    executionMode: 'staged',
    plaidEnvironment: getPlaidEnvironment(),
    liveBankExecutionReady: false,
    mercuryApprovalReady,
    achOriginationReady: mercuryApprovalReady,
    wireOriginationReady: mercuryApprovalReady,
    billerDirectReady: false,
    printableCheckReady: true,
    positivePayReady: true,
    supportedPayeeTypes: ['bank_payee', 'manual_payee', 'biller_direct'],
    supportedMethods: mercuryApprovalReady ? ['ach', 'wire', 'check'] : ['check'],
    notes: mercuryApprovalReady
      ? [
          'Plaid is used for bank aggregation and transaction synchronization, not outbound payment origination.',
          'Mercury outbound payments are queued through Mercury request-send-money and require a separate Mercury approval before funds move.',
          'ACH, domestic wire, and check requests can be prepared when the selected source account and recipient can be matched to Mercury.',
          'Biller-direct utility execution still requires a dedicated biller or bank-bill-pay rail.',
        ]
      : [
          'Bank feeds may be connected while outbound execution remains staged.',
          'Plaid is not treated as an outbound payment processor.',
          'Configure a Mercury API token with the minimum read + request-send-money scopes to enable approval-based Mercury payment requests.',
          'Printable check and Positive Pay support records can still be generated as staged execution artifacts.',
        ],
  };
}

export async function buildSettlementExecution({
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
  fundsRightsClassification,
}) {
  const capabilities = buildExecutionCapabilities();
  const payeeType = detectPayeeType({ vendorInstruction, vendorReceiveMethod });
  const fundsApplicationClass = resolveFundsApplicationClass({
    method,
    payeeType,
    fundsRightsClassification,
  });
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
  let simulatedProcessing = true;
  let executionMode = 'staged';
  let executionProvider = 'manual';
  let executionReference = `SET-${Date.now()}`;

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
  } else if (
    direction === 'outgoing' &&
    sourceType === 'bank_account' &&
    isMercurySource(sourceBankAccount) &&
    ['ach', 'wire', 'check'].includes(method)
  ) {
    rail =
      method === 'wire'
        ? 'Fedwire'
        : method === 'check'
          ? 'CheckIssue'
          : urgency === 'same_day'
            ? 'SameDayACH'
            : 'StandardACH';
    verificationStatus = 'pending';
    verificationMethod = 'bank_confirmation';
    executionProvider = 'mercury';
    simulatedProcessing = false;

    const sourceMethodDisabled =
      (method === 'ach' && sourceBankAccount?.achOriginationEnabled === false) ||
      (method === 'wire' && sourceBankAccount?.wireEnabled === false) ||
      (method === 'check' && sourceBankAccount?.checkDraftEnabled === false);

    const needsVerifiedBankInstructions =
      (method === 'ach' || method === 'wire') && !vendorInstructionVerified;

    if (sourceMethodDisabled) {
      processorStatus = 'requires_review';
      externalStatus = 'manual_review';
      executionReason = `The selected Mercury source account is not enabled for ${method.toUpperCase()} release in ClearFlow.`;
    } else if (needsVerifiedBankInstructions) {
      processorStatus = 'requires_review';
      externalStatus = 'manual_review';
      executionReason = 'Vendor bank instructions are incomplete or invalid.';
    } else if (!capabilities.mercuryApprovalReady) {
      processorStatus = 'requires_review';
      externalStatus = 'manual_review';
      executionReason =
        'Mercury is the selected bank rail, but the server does not yet have a Mercury API token configured.';
    } else {
      try {
        const queued = await queueMercuryPaymentApproval({
          settlementId,
          amount,
          method,
          sourceBankAccount,
          vendorInstruction,
        });
        executionReference = queued.request.requestId || executionReference;
        processorStatus = 'requires_review';
        externalStatus = 'accepted';
        executionReason =
          `Mercury accepted payment request ${executionReference} for approval. ` +
          'Funds will not move until an authorized Mercury user separately approves the request.';
      } catch (error) {
        processorStatus = 'requires_review';
        externalStatus = 'manual_review';
        executionReason =
          error instanceof Error
            ? error.message
            : 'Mercury could not queue the payment request for approval.';
      }
    }
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
        : `${policyDecision.reason} No outbound bank provider is enabled for this non-Mercury source, so the settlement remains staged.`;
    verificationStatus = 'pending';
    verificationMethod =
      sourceType === 'ledger_account' ? 'internal_control_token' : 'bank_confirmation';
    processorStatus = sourceType === 'ledger_account' ? 'queued' : 'requires_review';
    externalStatus = sourceType === 'ledger_account' ? 'staged' : 'manual_review';
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
    executionReference,
    fundsRightsClassification,
    fundsApplicationClass,
    sourceType,
    vendorInstructionVerified,
    simulatedProcessing,
    liveExecution,
    executionMode,
    executionProvider,
    payeeType,
    externalStatus,
    createdAt: new Date().toISOString(),
  };
}
