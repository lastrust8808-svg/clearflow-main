import type { AppData, User } from '../types/app.models';

export type LocalAuthContactType = 'email' | 'phone';

export interface LocalAuthChallenge {
  contactType: LocalAuthContactType;
  contactValue: string;
  maskedTarget: string;
  codePreview: string;
  expiresAt: string;
  isExistingUser: boolean;
  deliveryMode: 'in_app_preview';
}

interface LocalAuthAccountRecord {
  userId: string;
  contactType: LocalAuthContactType;
  contactValue: string;
  pendingCode?: string;
  codeExpiresAt?: string;
  appData: AppData;
}

const LOCAL_AUTH_STORAGE_KEY = 'clearflow-local-auth-accounts-v1';

function getStorage() {
  return window.localStorage;
}

function loadAccounts(): LocalAuthAccountRecord[] {
  try {
    const raw = getStorage().getItem(LOCAL_AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalAuthAccountRecord[]) : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: LocalAuthAccountRecord[]) {
  getStorage().setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(accounts));
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    return `+${digits.slice(1).replace(/\D/g, '')}`;
  }
  return digits.replace(/\D/g, '');
}

export function normalizeCredentialValue(
  contactType: LocalAuthContactType,
  contactValue: string
) {
  return contactType === 'email'
    ? normalizeEmail(contactValue)
    : normalizePhone(contactValue);
}

function maskEmail(value: string) {
  const [localPart, domain = ''] = value.split('@');
  if (!localPart) {
    return value;
  }
  const safeLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? ''}*`
      : `${localPart.slice(0, 2)}${'*'.repeat(Math.max(1, localPart.length - 2))}`;
  return `${safeLocal}@${domain}`;
}

function maskPhone(value: string) {
  if (value.length <= 4) {
    return value;
  }
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function buildMaskedTarget(contactType: LocalAuthContactType, value: string) {
  return contactType === 'email' ? maskEmail(value) : maskPhone(value);
}

function buildVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildAppData(user: User): AppData {
  return {
    user,
    entities: [],
  };
}

function findAccount(
  accounts: LocalAuthAccountRecord[],
  contactType: LocalAuthContactType,
  normalizedValue: string
) {
  return accounts.find(
    (account) =>
      account.contactType === contactType && account.contactValue === normalizedValue
  );
}

export function startLocalAuthChallenge(input: {
  contactType: LocalAuthContactType;
  contactValue: string;
  name?: string;
}): { success: true; challenge: LocalAuthChallenge } | { success: false; error: string } {
  const normalizedValue = normalizeCredentialValue(input.contactType, input.contactValue);
  if (!normalizedValue) {
    return { success: false, error: 'Enter a valid email or phone number.' };
  }

  const accounts = loadAccounts();
  const existingAccount = findAccount(accounts, input.contactType, normalizedValue);
  const code = buildVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  if (existingAccount) {
    const nextAccounts = accounts.map((account) =>
      account.userId === existingAccount.userId
        ? { ...account, pendingCode: code, codeExpiresAt: expiresAt }
        : account
    );
    saveAccounts(nextAccounts);
  } else {
    const userId = crypto.randomUUID();
    const user: User = {
      id: userId,
      name: input.name?.trim() || '',
      email: input.contactType === 'email' ? normalizedValue : undefined,
      phone: input.contactType === 'phone' ? normalizedValue : undefined,
      primaryContactType: input.contactType,
      isVerified: false,
    };
    accounts.unshift({
      userId,
      contactType: input.contactType,
      contactValue: normalizedValue,
      pendingCode: code,
      codeExpiresAt: expiresAt,
      appData: buildAppData(user),
    });
    saveAccounts(accounts);
  }

  return {
    success: true,
    challenge: {
      contactType: input.contactType,
      contactValue: normalizedValue,
      maskedTarget: buildMaskedTarget(input.contactType, normalizedValue),
      codePreview: code,
      expiresAt,
      isExistingUser: Boolean(existingAccount),
      deliveryMode: 'in_app_preview',
    },
  };
}

export function verifyLocalAuthChallenge(input: {
  contactType: LocalAuthContactType;
  contactValue: string;
  code: string;
}):
  | { success: true; userId: string; appData: AppData; isExistingUser: boolean }
  | { success: false; error: string } {
  const normalizedValue = normalizeCredentialValue(input.contactType, input.contactValue);
  const accounts = loadAccounts();
  const account = findAccount(accounts, input.contactType, normalizedValue);

  if (!account) {
    return { success: false, error: 'No account challenge was found for that contact.' };
  }

  if (!account.pendingCode || !account.codeExpiresAt) {
    return { success: false, error: 'Request a new verification code first.' };
  }

  if (new Date(account.codeExpiresAt).getTime() < Date.now()) {
    return { success: false, error: 'That verification code expired. Request a new one.' };
  }

  if (account.pendingCode !== input.code.trim()) {
    return { success: false, error: 'That verification code does not match.' };
  }

  const nextAccounts = accounts.map((item) =>
    item.userId === account.userId
      ? {
          ...item,
          pendingCode: undefined,
          codeExpiresAt: undefined,
        }
      : item
  );
  saveAccounts(nextAccounts);

  return {
    success: true,
    userId: account.userId,
    appData: account.appData,
    isExistingUser: Boolean(account.appData.user.name),
  };
}

export function saveLocalAuthAppData(userId: string, appData: AppData) {
  const accounts = loadAccounts();
  const nextAccounts = accounts.map((account) =>
    account.userId === userId ? { ...account, appData } : account
  );
  saveAccounts(nextAccounts);
}

