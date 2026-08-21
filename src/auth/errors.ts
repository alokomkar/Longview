import type { AuthFailure } from './types';

const codes: Record<string, AuthFailure> = {
  'auth/popup-closed-by-user': 'cancelled',
  'auth/cancelled-popup-request': 'cancelled',
  'auth/redirect-cancelled-by-user': 'cancelled',
  'auth/popup-blocked': 'popup-blocked',
  'auth/credential-already-in-use': 'account-conflict',
  'auth/account-exists-with-different-credential': 'account-conflict',
  'auth/network-request-failed': 'offline'
};

export function classifyAuthError(error: unknown): AuthFailure {
  if (typeof error !== 'object' || error === null || !('code' in error)) return 'unknown';
  const code = String((error as { code: unknown }).code);
  return codes[code] ?? 'unknown';
}
