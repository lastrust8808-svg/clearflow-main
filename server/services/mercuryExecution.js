const MERCURY_BASE_URL = 'https://api.mercury.com/api/v1';

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

export function isMercuryExecutionConfigured() {
  return Boolean(String(process.env.MERCURY_API_TOKEN || '').trim());
}

async function mercuryRequest(path, init = {}) {
  const token = String(process.env.MERCURY_API_TOKEN || '').trim();
  if (!token) {
    const error = new Error('Mercury API is not configured on the ClearFlow server.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`${MERCURY_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error(
      payload?.message ||
      payload?.error ||
      payload?.detail ||
      `Mercury API request failed with status ${response.status}.`
    );
    error.statusCode = response.status;
    error.providerPayload = payload;
    throw error;
  }

  return payload;
}

async function listMercuryAccounts() {
  const payload = await mercuryRequest('/accounts?limit=1000&order=asc');
  return Array.isArray(payload?.accounts) ? payload.accounts : [];
}

async function listMercuryRecipients() {
  const payload = await mercuryRequest('/recipients?limit=1000&order=asc');
  return Array.isArray(payload?.recipients) ? payload.recipients : [];
}

export async function resolveMercuryAccount(sourceBankAccount = {}) {
  const accounts = (await listMercuryAccounts()).filter(
    (account) => account?.status === 'active' && account?.type === 'mercury'
  );
  const sourceAccountNumber = normalizeDigits(sourceBankAccount.accountNumber);
  const sourceLast4 = normalizeDigits(sourceBankAccount.last4).slice(-4);
  const sourceRouting = normalizeDigits(sourceBankAccount.routingNumber);
  const sourceName = normalizeText(sourceBankAccount.accountName);

  const scored = accounts
    .map((account) => {
      const accountNumber = normalizeDigits(account.accountNumber);
      const routingNumber = normalizeDigits(account.routingNumber);
      const name = normalizeText(account.nickname || account.name);
      let score = 0;

      if (sourceAccountNumber && accountNumber === sourceAccountNumber) score += 100;
      if (sourceLast4 && accountNumber.endsWith(sourceLast4)) score += 25;
      if (sourceRouting && routingNumber === sourceRouting) score += 10;
      if (sourceName && name && (name === sourceName || name.includes(sourceName) || sourceName.includes(name))) {
        score += 5;
      }

      return { account, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    const error = new Error(
      'ClearFlow could not match the selected bank account to a Mercury account. Verify the source account mapping before release.'
    );
    error.statusCode = 409;
    throw error;
  }

  if (scored.length > 1 && scored[0].score === scored[1].score) {
    const error = new Error(
      'More than one Mercury account matches the selected source. A unique source account is required before release.'
    );
    error.statusCode = 409;
    throw error;
  }

  return scored[0].account;
}

export async function resolveMercuryRecipient(vendorInstruction = {}) {
  const recipients = (await listMercuryRecipients()).filter(
    (recipient) => recipient?.status === 'active'
  );
  const beneficiaryName = normalizeText(vendorInstruction.beneficiaryName);
  const remittanceEmail = normalizeText(vendorInstruction.remittanceEmail);
  const routingNumber = normalizeDigits(vendorInstruction.routingNumber);
  const accountNumber = normalizeDigits(vendorInstruction.accountNumber);

  const scored = recipients
    .map((recipient) => {
      const ach = recipient.electronicRoutingInfo || {};
      const wire = recipient.domesticWireRoutingInfo || {};
      const recipientEmails = [
        recipient.contactEmail,
        ...(Array.isArray(recipient.emails) ? recipient.emails : []),
      ].map(normalizeText);
      let score = 0;

      const routingMatches =
        routingNumber &&
        [ach.routingNumber, wire.routingNumber]
          .map(normalizeDigits)
          .includes(routingNumber);
      const accountMatches =
        accountNumber &&
        [ach.accountNumber, wire.accountNumber]
          .map(normalizeDigits)
          .includes(accountNumber);

      if (routingMatches && accountMatches) score += 100;
      if (remittanceEmail && recipientEmails.includes(remittanceEmail)) score += 30;
      if (
        beneficiaryName &&
        [recipient.name, recipient.nickname]
          .map(normalizeText)
          .filter(Boolean)
          .includes(beneficiaryName)
      ) {
        score += 20;
      }

      return { recipient, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    const error = new Error(
      'The vendor is not yet matched to an active Mercury recipient. Add or verify the recipient in Mercury before release.'
    );
    error.statusCode = 409;
    throw error;
  }

  if (scored.length > 1 && scored[0].score === scored[1].score) {
    const error = new Error(
      'More than one Mercury recipient matches this vendor. Review the recipient details before release.'
    );
    error.statusCode = 409;
    throw error;
  }

  return scored[0].recipient;
}

function mercuryPaymentMethod(method) {
  if (method === 'wire') return 'domesticWire';
  if (method === 'check') return 'check';
  return 'ach';
}

export async function queueMercuryPaymentApproval({
  settlementId,
  amount,
  method,
  sourceBankAccount,
  vendorInstruction,
}) {
  const sourceAccount = await resolveMercuryAccount(sourceBankAccount);
  const recipient = await resolveMercuryRecipient(vendorInstruction);
  const paymentMethod = mercuryPaymentMethod(method);
  const beneficiaryName =
    vendorInstruction?.beneficiaryName || recipient.name || 'Vendor';

  const body = {
    amount: Number(amount),
    idempotencyKey: `clearflow-${settlementId}`,
    note: `ClearFlow settlement ${settlementId}`,
    externalMemo: `ClearFlow ${settlementId}`,
    paymentMethod,
    recipientId: recipient.id,
    ...(paymentMethod === 'domesticWire'
      ? {
          purpose: {
            simple: {
              category: 'Vendor',
              additionalInfo: beneficiaryName,
            },
          },
        }
      : {}),
  };

  const request = await mercuryRequest(
    `/account/${encodeURIComponent(sourceAccount.id)}/request-send-money`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );

  return {
    request,
    sourceAccount: {
      id: sourceAccount.id,
      name: sourceAccount.nickname || sourceAccount.name,
      last4: normalizeDigits(sourceAccount.accountNumber).slice(-4),
    },
    recipient: {
      id: recipient.id,
      name: recipient.name,
    },
  };
}

export async function getMercuryApprovalRequest(requestId) {
  return mercuryRequest(`/request-send-money/${encodeURIComponent(requestId)}`);
}


export async function getMercuryTransactionById(transactionId) {
  return mercuryRequest(`/transaction/${encodeURIComponent(transactionId)}`);
}

export async function getMercuryPaymentStatus(requestId) {
  const approvalRequest = await getMercuryApprovalRequest(requestId);
  let transactions = [];

  if (approvalRequest?.accountId) {
    const query = new URLSearchParams({
      limit: '100',
      order: 'desc',
      requestId: String(requestId),
    });
    const payload = await mercuryRequest(
      `/account/${encodeURIComponent(approvalRequest.accountId)}/transactions?${query.toString()}`
    );
    transactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
  }

  return {
    approvalRequest,
    transactions,
  };
}
