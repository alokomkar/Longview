import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../auth/types';
import { profileIdentityChanged } from './types';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };

describe('profileIdentityChanged', () => {
  it('skips unchanged profile writes', () => {
    expect(profileIdentityChanged({ displayName: null, authMode: 'anonymous' }, user)).toBe(false);
  });

  it.each([
    [null],
    [{ displayName: 'Owner', authMode: 'anonymous' }],
    [{ displayName: null, authMode: 'google' }]
  ])('updates missing or changed identity data %#', profile => {
    expect(profileIdentityChanged(profile, user)).toBe(true);
  });
});
