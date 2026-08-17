import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../auth/types';
import type { TodayStep } from './deriveTodayStep';
import { completionFromStep, parseTodayCompletion } from './types';

const user: AuthUser = { uid: 'owner', displayName: 'Owner', isAnonymous: false };
const step: TodayStep = {
  completionId: '2026-08-17_plan-1_first-proof-v1', date: '2026-08-17', planId: 'plan-1',
  planTitle: 'Launch Longview', title: 'Define the first proof of progress',
  description: 'Write one observable result.', durationMinutes: 60, targetDate: '2026-09-30'
};

describe('Today completion boundary', () => {
  it('builds a stable owner-scoped completion from a step', () => {
    expect(completionFromStep(user, step)).toEqual({
      id: step.completionId, ownerUid: 'owner', workspaceId: 'default', planId: 'plan-1',
      stepKey: 'first-proof-v1', completedDate: '2026-08-17', durationMinutes: 60,
      status: 'completed', schemaVersion: 1
    });
  });

  it('accepts a valid stored completion with server metadata', () => {
    const stored = { ...completionFromStep(user, step), completedAt: new Date() };
    expect(parseTodayCompletion(stored, step.completionId, 'owner', step)).toMatchObject({ status: 'completed' });
  });

  it.each([
    [null],
    [{ ...completionFromStep(user, step), ownerUid: 'other' }],
    [{ ...completionFromStep(user, step), id: 'other' }],
    [{ ...completionFromStep(user, step), durationMinutes: 29 }],
    [{ ...completionFromStep(user, step), completedDate: 'not-a-date' }],
    [{ ...completionFromStep(user, step), completedDate: '2026-02-30' }],
    [{ ...completionFromStep(user, step), status: 'open' }]
  ])('rejects malformed or mismatched completion data %#', value => {
    expect(parseTodayCompletion(value, step.completionId, 'owner', step)).toBeNull();
  });

  it('rejects a valid completion that belongs to a different step', () => {
    const stored = { ...completionFromStep(user, step), planId: 'other-plan' };
    expect(parseTodayCompletion(stored, step.completionId, 'owner', step)).toBeNull();
  });
});
