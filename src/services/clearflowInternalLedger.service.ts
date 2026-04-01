import { getApiBaseUrl } from './runtimeConfig.service';

const INTERNAL_LEDGER_API_BASE = getApiBaseUrl();

interface AgreementDepositPayload {
  depositId: string;
  userId: string;
  userEmail?: string;
  signerName?: string;
  entityId?: string;
  termsDocumentId: string;
  retainedRecordDocumentId: string;
  termsAcceptedAt: string;
}

export async function recordClearFlowAgreementDeposit(payload: AgreementDepositPayload) {
  const response = await fetch(
    `${INTERNAL_LEDGER_API_BASE}/api/storage/internal/clearflow-ledger/agreement-deposits`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error('Failed to record ClearFlow internal ledger deposit.');
  }

  return response.json() as Promise<{
    success: boolean;
    result: {
      depositId: string;
      recordedAt: string;
      status: 'recorded';
    };
  }>;
}
