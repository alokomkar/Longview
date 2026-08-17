import { describe, expect, it } from 'vitest';
import { parseStoredPlan, validatePlanDraft, type PlanDraft } from './types';

const valid: PlanDraft = {
  clientRequestId: 'plan-1',
  title: 'Launch a useful product',
  outcome: 'Release a tested product to real users.',
  why: 'Learn which problem is worth solving well.',
  targetDate: '2026-09-30',
  weeklyHours: 10
};

describe('validatePlanDraft', () => {
  it('accepts boundary-safe input', () => {
    expect(validatePlanDraft(valid, '2026-08-17')).toEqual({});
  });

  it.each([
    [{ title: 'x' }, 'title'],
    [{ title: 'x'.repeat(81) }, 'title'],
    [{ outcome: 'short' }, 'outcome'],
    [{ why: '' }, 'why'],
    [{ targetDate: '2026-08-16' }, 'targetDate'],
    [{ targetDate: 'not-a-date' }, 'targetDate'],
    [{ targetDate: '2026-02-30' }, 'targetDate'],
    [{ weeklyHours: 0 }, 'weeklyHours'],
    [{ weeklyHours: 41 }, 'weeklyHours'],
    [{ weeklyHours: 1.5 }, 'weeklyHours']
  ])('rejects invalid %o', (change, field) => {
    expect(validatePlanDraft({ ...valid, ...change }, '2026-08-17')).toHaveProperty(field);
  });
});

describe('parseStoredPlan', () => {
  const stored = {
    ...valid, id: 'plan-1', ownerUid: 'owner', workspaceId: 'default', status: 'active', schemaVersion: 1,
    createdAt: new Date(), updatedAt: new Date()
  };

  it('accepts a valid owner-matching stored Plan', () => {
    expect(parseStoredPlan(stored, 'plan-1', 'owner')).toMatchObject({ id: 'plan-1', ownerUid: 'owner' });
  });

  it.each([
    [null],
    [{ ...stored, id: 'other' }],
    [{ ...stored, ownerUid: 'other' }],
    [{ ...stored, outcome: 'short' }],
    [{ ...stored, weeklyHours: Number.NaN }],
    [{ ...stored, targetDate: 'not-a-date' }],
    [{ ...stored, targetDate: '2026-02-30' }],
    [{ ...stored, schemaVersion: 2 }]
  ])('rejects malformed or mismatched data %#', (value) => {
    expect(parseStoredPlan(value, 'plan-1', 'owner')).toBeNull();
  });
});
