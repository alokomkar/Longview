import { describe, expect, it } from 'vitest';
import { orderWorkingDays, parseStoredPlan, validatePlanDraft, validatePlanSchedule, type PlanDraft } from './types';

const valid: PlanDraft = {
  clientRequestId: 'plan-1',
  title: 'Launch a useful product',
  outcome: 'Release a tested product to real users.',
  why: 'Learn which problem is worth solving well.',
  targetDate: '2026-09-30',
  weeklyHours: 10,
  workingDays: ['mon', 'wed', 'fri']
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
    [{ weeklyHours: 1.5 }, 'weeklyHours'],
    [{ workingDays: [] }, 'workingDays'],
    [{ workingDays: ['mon', 'mon'] }, 'workingDays']
  ])('rejects invalid %o', (change, field) => {
    expect(validatePlanDraft({ ...valid, ...change } as PlanDraft, '2026-08-17')).toHaveProperty(field);
  });
});

describe('parseStoredPlan', () => {
  const stored = {
    ...valid, id: 'plan-1', ownerUid: 'owner', workspaceId: 'default', status: 'active', schemaVersion: 2,
    scheduleVersion: 1,
    createdAt: new Date(), updatedAt: new Date()
  };

  it('accepts a valid owner-matching stored Plan', () => {
    expect(parseStoredPlan(stored, 'plan-1', 'owner')).toMatchObject({ id: 'plan-1', ownerUid: 'owner', workingDays: ['mon', 'wed', 'fri'] });
  });

  it('preserves a legacy Plan as explicitly unscheduled', () => {
    const { workingDays: _workingDays, scheduleVersion: _scheduleVersion, ...legacy } = stored;
    expect(parseStoredPlan({ ...legacy, schemaVersion: 1 }, 'plan-1', 'owner')).toMatchObject({ workingDays: null, scheduleVersion: 0 });
  });

  it.each([
    [null],
    [{ ...stored, id: 'other' }],
    [{ ...stored, ownerUid: 'other' }],
    [{ ...stored, outcome: 'short' }],
    [{ ...stored, weeklyHours: Number.NaN }],
    [{ ...stored, targetDate: 'not-a-date' }],
    [{ ...stored, targetDate: '2026-02-30' }],
    [{ ...stored, schemaVersion: 3 }],
    [{ ...stored, workingDays: [] }],
    [{ ...stored, workingDays: ['mon', 'mon'] }],
    [{ ...stored, scheduleVersion: 0 }]
  ])('rejects malformed or mismatched data %#', (value) => {
    expect(parseStoredPlan(value, 'plan-1', 'owner')).toBeNull();
  });
});

describe('validatePlanSchedule', () => {
  it('stores selected days in calendar order', () => {
    expect(orderWorkingDays(['fri', 'mon', 'wed'])).toEqual(['mon', 'wed', 'fri']);
  });

  it.each([
    [{ workingDays: ['mon'], weeklyHours: 1 }, true],
    [{ workingDays: ['sun'], weeklyHours: 40 }, true],
    [{ workingDays: [], weeklyHours: 10 }, false],
    [{ workingDays: ['mon', 'mon'], weeklyHours: 10 }, false],
    [{ workingDays: ['mon'], weeklyHours: 0 }, false],
    [{ workingDays: ['mon'], weeklyHours: 41 }, false]
  ])('validates schedule boundaries %#', (draft, validSchedule) => {
    expect(Object.keys(validatePlanSchedule(draft as never)).length === 0).toBe(validSchedule);
  });
});
