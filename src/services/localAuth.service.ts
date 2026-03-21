import type { AppData, User } from '../types/app.models';

export type LocalAuthContactType = 'email' | 'phone';
export type LocalAuthIdentifierType = 'email' | 'phone' | 'user_id';

export interface LocalAuthChallenge {
  contactType: LocalAuthContactType;
  contactValue: string;
  maskedTarget: string;
  codePreview?: string;
  expiresAt: string;
  isExistingUser: boolean;
  deliveryMode: 'in_app_preview' | 'email_sent' | 'sms_sent';
  deliveryMessage?: string;
}

interface LocalAuthAccountRecord {
  userId: string;
  contactType: LocalAuthContactType;
  contactValue: string;
  userHandle?: string;
  passwordHash?: string;
  pendingCode?: string;
  codeExpiresAt?: string;
  appData: AppData;
}

const LOCAL_AUTH_STORAGE_KEY = 'clearflow-local-auth-accounts-v2';

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

function normalizeUserHandle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '');
}

export function normalizeCredentialValue(
  contactType: LocalAuthContactType,
  contactValue: string
) {
  return contactType === 'email'
    ? normalizeEmail(contactValue)
    : normalizePhone(contactValue);
}

export function normalizeIdentifierValue(
  identifierType: LocalAuthIdentifierType,
  value: string
) {
  switch (identifierType) {
    case 'email':
      return normalizeEmail(value);
    case 'phone':
      return normalizePhone(value);
    default:
      return normalizeUserHandle(value);
  }
}

function detectIdentifierType(value: string): LocalAuthIdentifierType {
  const trimmed = value.trim();
  if (trimmed.includes('@')) {
    return 'email';
  }
  if (/^\+?[\d\s().-]+$/.test(trimmed)) {
    return 'phone';
  }
  return 'user_id';
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

function findAccountByIdentifier(
  accounts: LocalAuthAccountRecord[],
  identifier: string
) {
  const identifierType = detectIdentifierType(identifier);
  const normalized = normalizeIdentifierValue(identifierType, identifier);

  return accounts.find((account) => {
    if (identifierType === 'user_id') {
      return normalizeUserHandle(account.userHandle || '') === normalized;
    }

    return account.contactType === identifierType && account.contactValue === normalized;
  });
}

function inferHandleFromUser(user: User) {
  if (user.userHandle) {
    return normalizeUserHandle(user.userHandle);
  }

  if (user.email) {
    const [localPart] = user.email.split('@');
    return normalizeUserHandle(localPart);
  }

  if (user.name) {
    return normalizeUserHandle(user.name.replace(/\s+/g, '.'));
  }

  return '';
}

function ensureUniqueHandle(accounts: LocalAuthAccountRecord[], preferredHandle: string, userId: string) {
  const base = normalizeUserHandle(preferredHandle) || `member.${userId.slice(0, 6)}`;
  let candidate = base;
  let suffix = 1;

  while (
    accounts.some(
      (account) =>
        account.userId !== userId &&
        normalizeUserHandle(account.userHandle || '') === candidate
    )
  ) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }

  return candidate;
}

async function hashPassword(password: string) {
  const data = new TextEncoder().encode(`clearflow.local.auth:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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
      userHandle: undefined,
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

export async function verifyLocalAuthChallenge(input: {
  contactType: LocalAuthContactType;
  contactValue: string;
  code: string;
  userHandle?: string;
  password?: string;
}):
  Promise<
    | { success: true; userId: string; appData: AppData; isExistingUser: boolean }
    | { success: false; error: string }
  > {
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

  const desiredHandle = input.userHandle?.trim()
    ? ensureUniqueHandle(accounts, input.userHandle, account.userId)
    : account.userHandle || inferHandleFromUser(account.appData.user);
  const passwordHash = input.password?.trim()
    ? await hashPassword(input.password.trim())
    : account.passwordHash;

  const nextAccounts = accounts.map((item) =>
    item.userId === account.userId
      ? {
          ...item,
          pendingCode: undefined,
          codeExpiresAt: undefined,
          userHandle: desiredHandle || item.userHandle,
          passwordHash,
          appData: {
            ...item.appData,
            user: {
              ...item.appData.user,
              userHandle: desiredHandle || item.appData.user.userHandle,
            },
          },
        }
      : item
  );
  saveAccounts(nextAccounts);

  const updatedAccount = nextAccounts.find((item) => item.userId === account.userId) || account;

  return {
    success: true,
    userId: updatedAccount.userId,
    appData: updatedAccount.appData,
    isExistingUser: Boolean(updatedAccount.appData.user.name),
  };
}

export async function authenticateLocalPassword(input: {
  identifier: string;
  password: string;
}): Promise<
  | { success: true; userId: string; appData: AppData }
  | { success: false; error: string }
> {
  const accounts = loadAccounts();
  const account = findAccountByIdentifier(accounts, input.identifier);

  if (!account) {
    return { success: false, error: 'No matching backup account was found.' };
  }

  if (!account.passwordHash) {
    return {
      success: false,
      error: 'This backup account does not have a password yet. Use the verification-code option first.',
    };
  }

  const candidateHash = await hashPassword(input.password);
  if (candidateHash !== account.passwordHash) {
    return { success: false, error: 'That password does not match.' };
  }

  return {
    success: true,
    userId: account.userId,
    appData: account.appData,
  };
}

export async function updateLocalAccountCredentials(input: {
  userId: string;
  appData?: AppData;
  userHandle?: string;
  password?: string;
}) {
  const accounts = loadAccounts();
  const account = accounts.find((item) => item.userId === input.userId);
  if (!account) {
    return;
  }

  const desiredHandle = input.userHandle?.trim()
    ? ensureUniqueHandle(accounts, input.userHandle, input.userId)
    : account.userHandle || inferHandleFromUser(input.appData?.user || account.appData.user);
  const nextPasswordHash = input.password?.trim()
    ? await hashPassword(input.password.trim())
    : account.passwordHash;

  const nextAccounts = accounts.map((item) =>
    item.userId === input.userId
      ? {
          ...item,
          userHandle: desiredHandle || item.userHandle,
          passwordHash: nextPasswordHash,
          appData: input.appData
            ? {
                ...input.appData,
                user: {
                  ...input.appData.user,
                  userHandle: desiredHandle || input.appData.user.userHandle,
                },
              }
            : {
                ...item.appData,
                user: {
                  ...item.appData.user,
                  userHandle: desiredHandle || item.appData.user.userHandle,
                },
              },
        }
      : item
  );

  saveAccounts(nextAccounts);
}

export function saveLocalAuthAppData(userId: string, appData: AppData) {
  const accounts = loadAccounts();
  const nextAccounts = accounts.map((account) =>
    account.userId === userId
      ? {
          ...account,
          userHandle:
            appData.user.userHandle || account.userHandle || inferHandleFromUser(appData.user),
          appData,
        }
      : account
  );
  saveAccounts(nextAccounts);
}
