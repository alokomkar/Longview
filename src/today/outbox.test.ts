import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../auth/types';
import type { TodayStep } from './deriveTodayStep';
import { parseTodayPendingCompletion, pendingCompletionFromStep, todayOutboxKey } from './outbox';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const step: TodayStep = {
  completionId: '2026-08-17_plan-1_first-proof-v1', date: '2026-08-17', planId: 'plan-1',
  planTitle: 'Plan', title: 'Step', description: 'Proof', durationMinutes: 30, targetDate: '2026-09-30'
};

describe('today outbox boundary', () => {
  it('creates a deterministic owner-scoped item', () => {
    const first = pendingCompletionFromStep(user, step, 10);
    const second = pendingCompletionFromStep(user, step, 20);
    expect(first.key).toBe(todayOutboxKey(user.uid, step.completionId));
    expect(second.key).toBe(first.key);
    expect(first.createdAtEpochMs).toBe(10);
    expect(parseTodayPendingCompletion(first, user, step)).toEqual(first);
  });

  it.each([
    ['null', null],
    ['wrong owner', { ownerUid: 'other' }],
    ['wrong key', { key: 'other' }],
    ['wrong schema', { schemaVersion: 2 }],
    ['bad created time', { createdAtEpochMs: Number.NaN }],
    ['negative attempts', { attemptCount: -1 }],
    ['unknown failure', { lastFailure: 'fatal' }],
    ['wrong completion owner', { completion: { ownerUid: 'other' } }],
    ['wrong Plan', { completion: { planId: 'other' } }]
  ])('rejects %s', (_label, override) => {
    const valid = pendingCompletionFromStep(user, step, 10);
    const value = override === null ? null : {
      ...valid,
      ...override,
      completion: 'completion' in override ? { ...valid.completion, ...override.completion } : valid.completion
    };
    expect(parseTodayPendingCompletion(value, user, step)).toBeNull();
  });
});
