const STORAGE_API_BASE =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin.includes('localhost')
      ? 'http://localhost:8000'
      : window.location.origin
    : 'http://localhost:8000';

function buildRemittanceUrl(accountId: string, vendorId: string) {
  return `${STORAGE_API_BASE}/api/storage/accounts/${encodeURIComponent(
    accountId
  )}/vendors/${encodeURIComponent(vendorId)}/remittance-instructions`;
}

export interface RemittanceInstructionPayload {
  beneficiaryName: string;
  bankName?: string;
  routingNumber: string;
  accountNumber: string;
  accountType?: 'checking' | 'savings' | 'business_checking' | 'other';
  railPreference?: 'ach' | 'eft' | 'wire';
  remittanceEmail?: string;
}

export interface MaskedRemittanceInstruction {
  beneficiaryName?: string;
  bankName?: string;
  accountMask?: string;
  routingMask?: string;
  accountType?: 'checking' | 'savings' | 'business_checking' | 'other';
  railPreference?: 'ach' | 'eft' | 'wire';
  remittanceEmail?: string;
}

export async function saveVendorRemittanceInstructions(
  accountId: string,
  vendorId: string,
  payload: RemittanceInstructionPayload
) {
  const response = await fetch(buildRemittanceUrl(accountId, vendorId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Failed to save secure remittance instructions.');
  }

  return (await response.json()) as {
    success: boolean;
    masked: MaskedRemittanceInstruction;
  };
}

export async function loadVendorRemittanceInstructions(accountId: string, vendorId: string) {
  const response = await fetch(buildRemittanceUrl(accountId, vendorId), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to load secure remittance instructions.');
  }

  return (await response.json()) as {
    success: boolean;
    instructions: RemittanceInstructionPayload;
    savedAt?: string;
  };
}
