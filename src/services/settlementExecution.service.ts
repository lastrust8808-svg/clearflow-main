import { getApiBaseUrl } from './runtimeConfig.service';

type SettlementExecutionRail =
  | 'FedNow'
  | 'RTP'
  | 'Fedwire'
  | 'SameDayACH'
  | 'StandardACH'
  | 'CheckIssue'
  | 'LedgerRemittance'
  | 'None';

type ProcessorStatus =
  | 'queued'
  | 'processing'
  | 'settled'
  | 'requires_review'
  | 'blocked';

type ExecutionProvider = 'plaid' | 'manual';
type ExecutionMode = 'live' | 'staged';
type ExecutionPayeeType = 'bank_payee' | 'biller_direct' | 'manual_payee';
type ExternalExecutionStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'processing'
  | 'settled'
  | 'failed'
  | 'returned'
  | 'applied'
  | 'manual_review'
  | 'staged';

interface ExecuteSettlementPayload {
  entityId: string;
  paymentId: string;
  settlementId: string;
  amount: number;
  currency: string;
  direction: 'incoming' | 'outgoing';
  method: 'ach' | 'wire' | 'check' | 'card' | 'cash' | 'digital_asset' | 'other';
  urgency?: 'instant' | 'same_day' | 'standard' | 'final';
  sourceBankAccount?: {
    id: string;
    institutionName?: string;
    routingNumber?: string;
    accountNumber?: string;
    achOriginationEnabled?: boolean;
    wireEnabled?: boolean;
    checkDraftEnabled?: boolean;
    positivePayEnabled?: boolean;
    overdraftPolicy?: 'none' | 'bank_authorized' | 'controlled_sweep' | 'manual_review';
    connectionType?: string;
  } | null;
  sourceLedgerAccount?: {
    id: string;
    name: string;
    remittanceEligible?: boolean;
    remittanceClassification?: string;
  } | null;
  vendorInstruction?: {
    beneficiaryName?: string;
    bankName?: string;
    routingNumber?: string;
    accountNumber?: string;
    railPreference?: 'ach' | 'eft' | 'wire';
    verificationStatus?: 'unverified' | 'routing_valid' | 'verified' | 'invalid';
  } | null;
  vendorReceiveMethod?: 'ach' | 'wire' | 'paper_check' | 'lockbox_coupon' | 'digital_wallet' | 'manual_review';
}

interface ExecuteSettlementResponse {
  success: boolean;
  execution: {
    id: string;
    rail: SettlementExecutionRail;
    processorStatus: ProcessorStatus;
    verificationStatus: 'verified' | 'pending' | 'exception';
    verificationMethod:
      | 'bank_confirmation'
      | 'wallet_confirmation'
      | 'internal_control_token'
      | 'reserve_attestation'
      | 'manual_override';
    executionReason: string;
    executionReference: string;
    sourceType: 'bank_account' | 'ledger_account' | 'manual_remittance';
    vendorInstructionVerified: boolean;
    simulatedProcessing: boolean;
    liveExecution: boolean;
    executionMode: ExecutionMode;
    executionProvider: ExecutionProvider;
    payeeType: ExecutionPayeeType;
    externalStatus: ExternalExecutionStatus;
  };
}

export interface SettlementExecutionCapabilitiesResponse {
  success: boolean;
  capabilities: {
    provider: ExecutionProvider;
    executionMode: ExecutionMode;
    plaidEnvironment: string;
    liveBankExecutionReady: boolean;
    achOriginationReady: boolean;
    wireOriginationReady: boolean;
    billerDirectReady: boolean;
    printableCheckReady: boolean;
    positivePayReady: boolean;
    supportedPayeeTypes: ExecutionPayeeType[];
    supportedMethods: string[];
    notes: string[];
  };
}

const ERP_API_BASE = getApiBaseUrl();

function buildLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function executeSettlementProcessing(payload: ExecuteSettlementPayload) {
  try {
    const response = await fetch(`${ERP_API_BASE}/api/erp/settlements/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error('Failed to execute settlement.');
    }

    return (await response.json()) as ExecuteSettlementResponse;
  } catch {
    const vendorInstructionVerified = Boolean(
      payload.vendorInstruction?.routingNumber && payload.vendorInstruction?.accountNumber
    );
    const sourceType = payload.sourceBankAccount
      ? ('bank_account' as const)
      : payload.sourceLedgerAccount
        ? ('ledger_account' as const)
        : ('manual_remittance' as const);

    return {
      success: true,
      execution: {
        id: buildLocalId('settlement-exec'),
        rail:
          payload.method === 'wire'
            ? 'Fedwire'
            : payload.sourceLedgerAccount
              ? 'LedgerRemittance'
              : 'StandardACH',
        processorStatus: vendorInstructionVerified ? 'processing' : 'requires_review',
        verificationStatus: vendorInstructionVerified ? 'pending' : 'exception',
        verificationMethod: payload.sourceLedgerAccount
          ? 'internal_control_token'
          : 'bank_confirmation',
        executionReason: vendorInstructionVerified
          ? 'Local fallback execution path prepared from stored vendor payment instructions.'
          : 'Vendor bank instructions are incomplete or unavailable.',
        executionReference: buildLocalId('exec-ref'),
        sourceType,
        vendorInstructionVerified,
        simulatedProcessing: true,
        liveExecution: false,
        executionMode: 'staged',
        executionProvider: 'manual',
        payeeType: payload.vendorReceiveMethod === 'lockbox_coupon' ? 'biller_direct' : 'manual_payee',
        externalStatus: vendorInstructionVerified ? 'staged' : 'manual_review',
      },
    };
  }
}

export async function getSettlementExecutionCapabilities() {
  try {
    const response = await fetch(`${ERP_API_BASE}/api/erp/settlements/execution-capabilities`);
    if (!response.ok) {
      throw new Error('Failed to load execution capabilities.');
    }

    return (await response.json()) as SettlementExecutionCapabilitiesResponse;
  } catch {
    return {
      success: true,
      capabilities: {
        provider: 'manual',
        executionMode: 'staged',
        plaidEnvironment: 'sandbox',
        liveBankExecutionReady: false,
        achOriginationReady: false,
        wireOriginationReady: false,
        billerDirectReady: false,
        printableCheckReady: true,
        positivePayReady: true,
        supportedPayeeTypes: ['manual_payee', 'bank_payee', 'biller_direct'],
        supportedMethods: ['check'],
        notes: [
          'Live settlement execution capabilities could not be loaded.',
          'Printable check and Positive Pay support records can still be staged locally.',
          'Treat external execution as staged until a provider confirms submission.',
        ],
      },
    };
  }
}
