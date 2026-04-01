import { promises as fs } from 'node:fs';
import path from 'node:path';

const LEDGER_ROOT = path.resolve(process.cwd(), 'server', 'storage-data', 'internal', 'clearflow-ledger');
const AGREEMENT_DEPOSITS_PATH = path.join(LEDGER_ROOT, 'agreement-deposits.json');

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function loadAgreementDeposits() {
  try {
    const raw = await fs.readFile(AGREEMENT_DEPOSITS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function recordClearFlowAgreementDeposit(input) {
  await ensureDirectory(LEDGER_ROOT);
  const deposits = await loadAgreementDeposits();
  const nextRecord = {
    depositId: input.depositId,
    userId: input.userId,
    userEmail: input.userEmail || null,
    signerName: input.signerName || null,
    entityId: input.entityId || null,
    termsDocumentId: input.termsDocumentId,
    retainedRecordDocumentId: input.retainedRecordDocumentId,
    termsAcceptedAt: input.termsAcceptedAt,
    recordedAt: new Date().toISOString(),
    status: 'recorded',
  };

  const existingIndex = deposits.findIndex((item) => item.depositId === input.depositId);
  const nextDeposits =
    existingIndex === -1
      ? [...deposits, nextRecord]
      : deposits.map((item, index) => (index === existingIndex ? nextRecord : item));

  await fs.writeFile(AGREEMENT_DEPOSITS_PATH, JSON.stringify(nextDeposits, null, 2), 'utf8');
  return nextRecord;
}
