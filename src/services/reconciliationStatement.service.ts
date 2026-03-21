import type {
  PaymentRecord,
  ReconciliationStatementLineRecord,
  TransactionRecord,
} from '../types/core';

interface ParsedStatementResult {
  lines: ReconciliationStatementLineRecord[];
  matchedLineIds: string[];
  unmatchedLineIds: string[];
  summary: string;
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      const nextCharacter = line[index + 1];
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function parseAmount(value?: string) {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/[$,\s]/g, '').trim();
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value?: string) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  const candidate = new Date(value);
  if (Number.isNaN(candidate.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return candidate.toISOString().slice(0, 10);
}

function detectColumns(headers: string[]) {
  const findHeader = (...patterns: string[]) =>
    headers.find((header) => patterns.some((pattern) => header.includes(pattern)));

  return {
    date: findHeader('date', 'posted', 'transaction_date'),
    description: findHeader('description', 'memo', 'details', 'narrative'),
    amount: findHeader('amount', 'transaction_amount'),
    debit: findHeader('debit', 'withdrawal', 'money_out'),
    credit: findHeader('credit', 'deposit', 'money_in'),
    reference: findHeader('reference', 'check', 'trace', 'id'),
  };
}

function absoluteDayDifference(left: string, right: string) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  const milliseconds = Math.abs(leftDate.getTime() - rightDate.getTime());
  return Math.round(milliseconds / (1000 * 60 * 60 * 24));
}

function buildSuggestedMatch(
  line: ReconciliationStatementLineRecord,
  payments: PaymentRecord[],
  transactions: TransactionRecord[]
) {
  const candidatePayments = payments
    .filter((payment) => payment.status === 'settled')
    .filter((payment) =>
      line.direction === 'credit'
        ? payment.direction === 'incoming'
        : payment.direction === 'outgoing'
    )
    .map((payment) => {
      const amountDelta = Math.abs(payment.amount - Math.abs(line.amount));
      const dayDelta = absoluteDayDifference(payment.paymentDate, line.postedDate);
      const confidenceScore = Number((1 - Math.min(amountDelta / Math.max(payment.amount, 1), 1)).toFixed(2));

      return {
        payment,
        amountDelta,
        dayDelta,
        confidenceScore,
      };
    })
    .filter((candidate) => candidate.amountDelta <= 0.01 && candidate.dayDelta <= 5)
    .sort((left, right) => {
      if (left.amountDelta !== right.amountDelta) {
        return left.amountDelta - right.amountDelta;
      }

      return left.dayDelta - right.dayDelta;
    });

  const bestMatch = candidatePayments[0];
  if (!bestMatch) {
    return {
      ...line,
      matchStatus: 'exception' as const,
      notes: 'No settled payment suggestion found for this imported statement line.',
    };
  }

  const suggestedTransactionIds = bestMatch.payment.linkedTransactionIds?.filter((transactionId) =>
    transactions.some((transaction) => transaction.id === transactionId)
  );

  return {
    ...line,
    matchStatus: 'suggested' as const,
    suggestedPaymentId: bestMatch.payment.id,
    suggestedTransactionIds,
    confidenceScore: bestMatch.confidenceScore,
    notes:
      suggestedTransactionIds?.length
        ? 'Suggested match generated from settled ERP payment and linked transaction history.'
        : 'Suggested match generated from settled ERP payment history.',
  };
}

function parseDelimitedStatement(
  text: string,
  payments: PaymentRecord[],
  transactions: TransactionRecord[]
) {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rawLines.length < 2) {
    return null;
  }

  const headerValues = splitCsvLine(rawLines[0]).map(normalizeHeader);
  const columns = detectColumns(headerValues);

  if (!columns.date || !columns.description || (!columns.amount && !columns.debit && !columns.credit)) {
    return null;
  }

  const lines = rawLines.slice(1).flatMap((rawLine, index) => {
    const values = splitCsvLine(rawLine);
    const row = Object.fromEntries(headerValues.map((header, valueIndex) => [header, values[valueIndex] ?? '']));
    const creditAmount = columns.credit ? parseAmount(row[columns.credit]) : null;
    const debitAmount = columns.debit ? parseAmount(row[columns.debit]) : null;
    const combinedAmount = columns.amount ? parseAmount(row[columns.amount]) : null;

    let amount = combinedAmount ?? creditAmount ?? debitAmount ?? 0;
    let direction: 'credit' | 'debit' =
      creditAmount !== null
        ? 'credit'
        : debitAmount !== null
          ? 'debit'
          : amount >= 0
            ? 'credit'
            : 'debit';

    if (direction === 'debit' && amount > 0) {
      amount = amount * -1;
    }

    if (direction === 'credit' && amount < 0) {
      amount = Math.abs(amount);
    }

    const baseLine: ReconciliationStatementLineRecord = {
      id: `stmt-line-${Date.now()}-${index}`,
      postedDate: normalizeDate(row[columns.date]),
      description: row[columns.description] || `Statement line ${index + 1}`,
      amount,
      direction,
      rawAmountText:
        row[columns.amount || ''] || row[columns.credit || ''] || row[columns.debit || ''],
      reference: columns.reference ? row[columns.reference] : undefined,
      matchStatus: 'unreviewed',
    };

    return [buildSuggestedMatch(baseLine, payments, transactions)];
  });

  return lines;
}

export async function parseStatementFileForReconciliation(input: {
  file?: File | null;
  payments: PaymentRecord[];
  transactions: TransactionRecord[];
}): Promise<ParsedStatementResult> {
  const { file, payments, transactions } = input;

  if (!file) {
    return {
      lines: [],
      matchedLineIds: [],
      unmatchedLineIds: [],
      summary: 'No statement file uploaded yet.',
    };
  }

  const lowerName = file.name.toLowerCase();
  const textCapable =
    file.type.startsWith('text/') ||
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.txt');

  if (textCapable) {
    const text = await file.text();
    const parsedLines = parseDelimitedStatement(text, payments, transactions);

    if (parsedLines?.length) {
      const matchedLineIds: string[] = [];
      const unmatchedLineIds: string[] = [];
      let suggestedCount = 0;

      parsedLines.forEach((line) => {
        if (line.matchStatus === 'suggested') {
          suggestedCount += 1;
          return;
        }

        unmatchedLineIds.push(line.id);
      });

      return {
        lines: parsedLines,
        matchedLineIds,
        unmatchedLineIds,
        summary: `Imported ${parsedLines.length} statement lines with ${suggestedCount} suggested match${suggestedCount === 1 ? '' : 'es'}.`,
      };
    }
  }

  const fallbackLine: ReconciliationStatementLineRecord = {
    id: `stmt-line-${Date.now()}-manual`,
    postedDate: new Date().toISOString().slice(0, 10),
    description: file.name,
    amount: 0,
    direction: 'debit',
    matchStatus: 'exception',
    notes:
      'This statement format could not be parsed automatically yet. Review manually and keep the source file linked to the reconciliation.',
  };

  return {
    lines: [fallbackLine],
    matchedLineIds: [],
    unmatchedLineIds: [fallbackLine.id],
    summary:
      'Statement file retained, but automatic parsing needs review for this file type.',
  };
}
