import { promises as fs } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const LEDGER_ROOT = path.resolve(
  process.cwd(),
  'server',
  'storage-data',
  'internal',
  'clearflow-ledger',
);
const AGREEMENT_DEPOSITS_PATH = path.join(LEDGER_ROOT, 'agreement-deposits.json');

let platformPool;
let platformSchemaReady;

function getPlatformConnectionString() {
  return String(
    process.env.CLEARFLOW_PLATFORM_DATABASE_URL ||
      process.env.CLEARFLOW_OWNER_DATABASE_URL ||
      '',
  ).trim();
}

function getPlatformPool() {
  const connectionString = getPlatformConnectionString();
  if (!connectionString) {
    return null;
  }

  if (!platformPool) {
    const usesPublicRenderHost =
      connectionString.includes('.render.com') &&
      !connectionString.includes('.internal');

    platformPool = new Pool({
      connectionString,
      ssl: usesPublicRenderHost ? { rejectUnauthorized: false } : false,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return platformPool;
}

async function ensurePlatformAgreementSchema() {
  const db = getPlatformPool();
  if (!db) {
    return false;
  }

  if (!platformSchemaReady) {
    platformSchemaReady = db
      .query(`
        CREATE TABLE IF NOT EXISTS clearflow_platform_agreement_deposits (
          deposit_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          user_email TEXT,
          signer_name TEXT,
          entity_id TEXT,
          terms_document_id TEXT NOT NULL,
          retained_record_document_id TEXT NOT NULL,
          contract_value_document_id TEXT,
          terms_accepted_at TIMESTAMPTZ NOT NULL,
          monthly_fee NUMERIC(14,2) NOT NULL,
          term_months INTEGER NOT NULL,
          annualized_contract_reference_value NUMERIC(16,2) NOT NULL,
          memo_debit_value NUMERIC(16,2) NOT NULL,
          memo_credit_value NUMERIC(16,2) NOT NULL,
          cash_value NUMERIC(16,2) NOT NULL DEFAULT 0,
          recognized_receivable_value NUMERIC(16,2) NOT NULL DEFAULT 0,
          value_classification TEXT NOT NULL,
          pool_eligibility TEXT NOT NULL,
          pool_id TEXT,
          verification_status TEXT NOT NULL,
          recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .then(async () => {
        await db.query(`
          CREATE INDEX IF NOT EXISTS clearflow_platform_agreement_deposits_pool_idx
          ON clearflow_platform_agreement_deposits
            (pool_eligibility, verification_status, recorded_at DESC)
        `);
        return true;
      })
      .catch((error) => {
        platformSchemaReady = undefined;
        throw error;
      });
  }

  return platformSchemaReady;
}

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function loadAgreementDeposits() {
  try {
    const raw = await fs.readFile(AGREEMENT_DEPOSITS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return [];
    }
    throw error;
  }
}

function buildAgreementDepositRecord(input) {
  const monthlyFee = Number(input.monthlyFee);
  const termMonths = Number(input.termMonths);

  if (!Number.isFinite(monthlyFee) || monthlyFee <= 0 || monthlyFee > 100_000) {
    throw new Error('Agreement monthly fee is outside the supported range.');
  }

  if (!Number.isInteger(termMonths) || termMonths <= 0 || termMonths > 120) {
    throw new Error('Agreement term must be between 1 and 120 months.');
  }

  const annualizedContractReferenceValue = Number(
    (monthlyFee * termMonths).toFixed(2),
  );

  return {
    depositId: input.depositId,
    userId: input.userId,
    userEmail: input.userEmail || null,
    signerName: input.signerName || null,
    entityId: input.entityId || null,
    termsDocumentId: input.termsDocumentId,
    retainedRecordDocumentId: input.retainedRecordDocumentId,
    contractValueDocumentId: input.contractValueDocumentId || null,
    termsAcceptedAt: input.termsAcceptedAt,
    monthlyFee: Number(monthlyFee.toFixed(2)),
    termMonths,
    annualizedContractReferenceValue,
    memoDebitValue: annualizedContractReferenceValue,
    memoCreditValue: annualizedContractReferenceValue,
    cashValue: 0,
    recognizedReceivableValue: 0,
    valueClassification: 'annualized_contract_reference',
    poolEligibility: 'review_required',
    poolId: null,
    verificationStatus: 'pending_contract_validation',
    recordedAt: new Date().toISOString(),
    status: 'recorded',
  };
}

async function saveAgreementDepositToDatabase(record) {
  const db = getPlatformPool();
  if (!db) {
    return null;
  }

  await ensurePlatformAgreementSchema();
  const result = await db.query(
    `
      INSERT INTO clearflow_platform_agreement_deposits (
        deposit_id,
        user_id,
        user_email,
        signer_name,
        entity_id,
        terms_document_id,
        retained_record_document_id,
        contract_value_document_id,
        terms_accepted_at,
        monthly_fee,
        term_months,
        annualized_contract_reference_value,
        memo_debit_value,
        memo_credit_value,
        cash_value,
        recognized_receivable_value,
        value_classification,
        pool_eligibility,
        pool_id,
        verification_status,
        recorded_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW()
      )
      ON CONFLICT (deposit_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        user_email = EXCLUDED.user_email,
        signer_name = EXCLUDED.signer_name,
        entity_id = EXCLUDED.entity_id,
        terms_document_id = EXCLUDED.terms_document_id,
        retained_record_document_id = EXCLUDED.retained_record_document_id,
        contract_value_document_id = EXCLUDED.contract_value_document_id,
        terms_accepted_at = EXCLUDED.terms_accepted_at,
        monthly_fee = EXCLUDED.monthly_fee,
        term_months = EXCLUDED.term_months,
        annualized_contract_reference_value =
          EXCLUDED.annualized_contract_reference_value,
        memo_debit_value = EXCLUDED.memo_debit_value,
        memo_credit_value = EXCLUDED.memo_credit_value,
        cash_value = EXCLUDED.cash_value,
        recognized_receivable_value = EXCLUDED.recognized_receivable_value,
        value_classification = EXCLUDED.value_classification,
        pool_eligibility = EXCLUDED.pool_eligibility,
        verification_status = EXCLUDED.verification_status,
        updated_at = NOW()
      RETURNING
        deposit_id,
        user_id,
        user_email,
        signer_name,
        entity_id,
        terms_document_id,
        retained_record_document_id,
        contract_value_document_id,
        terms_accepted_at,
        monthly_fee,
        term_months,
        annualized_contract_reference_value,
        memo_debit_value,
        memo_credit_value,
        cash_value,
        recognized_receivable_value,
        value_classification,
        pool_eligibility,
        pool_id,
        verification_status,
        recorded_at
    `,
    [
      record.depositId,
      record.userId,
      record.userEmail,
      record.signerName,
      record.entityId,
      record.termsDocumentId,
      record.retainedRecordDocumentId,
      record.contractValueDocumentId,
      record.termsAcceptedAt,
      record.monthlyFee,
      record.termMonths,
      record.annualizedContractReferenceValue,
      record.memoDebitValue,
      record.memoCreditValue,
      record.cashValue,
      record.recognizedReceivableValue,
      record.valueClassification,
      record.poolEligibility,
      record.poolId,
      record.verificationStatus,
      record.recordedAt,
    ],
  );

  const row = result.rows[0];
  return {
    depositId: row.deposit_id,
    userId: row.user_id,
    userEmail: row.user_email,
    signerName: row.signer_name,
    entityId: row.entity_id,
    termsDocumentId: row.terms_document_id,
    retainedRecordDocumentId: row.retained_record_document_id,
    contractValueDocumentId: row.contract_value_document_id,
    termsAcceptedAt: row.terms_accepted_at,
    monthlyFee: Number(row.monthly_fee),
    termMonths: Number(row.term_months),
    annualizedContractReferenceValue: Number(
      row.annualized_contract_reference_value,
    ),
    memoDebitValue: Number(row.memo_debit_value),
    memoCreditValue: Number(row.memo_credit_value),
    cashValue: Number(row.cash_value),
    recognizedReceivableValue: Number(row.recognized_receivable_value),
    valueClassification: row.value_classification,
    poolEligibility: row.pool_eligibility,
    poolId: row.pool_id,
    verificationStatus: row.verification_status,
    recordedAt: new Date(row.recorded_at).toISOString(),
    status: 'recorded',
  };
}

async function saveAgreementDepositToFile(record) {
  await ensureDirectory(LEDGER_ROOT);
  const deposits = await loadAgreementDeposits();
  const existingIndex = deposits.findIndex(
    (item) => item.depositId === record.depositId,
  );
  const nextDeposits =
    existingIndex === -1
      ? [...deposits, record]
      : deposits.map((item, index) =>
          index === existingIndex ? record : item,
        );

  await fs.writeFile(
    AGREEMENT_DEPOSITS_PATH,
    JSON.stringify(nextDeposits, null, 2),
    'utf8',
  );
  return record;
}

export async function recordClearFlowAgreementDeposit(input) {
  const record = buildAgreementDepositRecord(input);

  try {
    const databaseRecord = await saveAgreementDepositToDatabase(record);
    if (databaseRecord) {
      return databaseRecord;
    }
  } catch (error) {
    console.warn(
      'Falling back to file-backed ClearFlow agreement ledger after database write failure.',
      error,
    );
  }

  return saveAgreementDepositToFile(record);
}
