import { describe, expect, it } from 'vitest';
import { validatePlanDraft, type PlanDraft } from './types';

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
    [{ weeklyHours: 0 }, 'weeklyHours'],
    [{ weeklyHours: 41 }, 'weeklyHours'],
    [{ weeklyHours: 1.5 }, 'weeklyHours']
  ])('rejects invalid %o', (change, field) => {
    expect(validatePlanDraft({ ...valid, ...change }, '2026-08-17')).toHaveProperty(field);
  });
});
