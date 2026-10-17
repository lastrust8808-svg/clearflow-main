import { getApiBaseUrl } from './runtimeConfig.service';

const base = getApiBaseUrl();
export async function requestSecureEmailCode(email: string) {
  const response = await fetch(base + '/api/auth/session/email/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'Unable to send code.');
}
export async function confirmSecureEmailCode(email: string, code: string): Promise<{
  token: string; user: { id: string; email: string; role: string };
}> {
  const response = await fetch(base + '/api/auth/session/email/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const result = await response.json();
  if (!response.ok || !result.success || !result.token || !result.user?.id) {
    throw new Error(result.error || 'Invalid verification code.');
  }
  return { token: result.token, user: result.user };
}
export async function revokeSecureSession(token: string) {
  await fetch(base + '/api/auth/session/logout', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token },
  });
}
