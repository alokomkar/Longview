import { describe, expect, it } from 'vitest';
import { classifyAuthError } from './errors';

describe('classifyAuthError', () => {
  it.each([
    ['auth/popup-closed-by-user', 'cancelled'],
    ['auth/cancelled-popup-request', 'cancelled'],
    ['auth/popup-blocked', 'popup-blocked'],
    ['auth/credential-already-in-use', 'account-conflict'],
    ['auth/account-exists-with-different-credential', 'account-conflict'],
    ['auth/network-request-failed', 'offline'],
    ['auth/other', 'unknown']
  ])('maps %s to %s', (code, expected) => {
    expect(classifyAuthError({ code })).toBe(expected);
  });

  it.each([null, undefined, 'error', {}, { code: null }])('fails closed for malformed value %s', value => {
    expect(classifyAuthError(value)).toBe('unknown');
  });
});
