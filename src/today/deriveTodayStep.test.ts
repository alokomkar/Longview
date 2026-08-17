import { describe, expect, it } from 'vitest';
import type { Plan } from '../plan/types';
import { deriveTodayStep } from './deriveTodayStep';

const plan = (change: Partial<Plan> = {}): Plan => ({
  id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
  title: 'Launch Longview', outcome: 'Release a tested PWA to real users.',
  why: 'Validate the product direction.', targetDate: '2026-09-30', weeklyHours: 4,
  status: 'active', schemaVersion: 1, ...change
});

describe('deriveTodayStep', () => {
  it('returns no step when there are no active Plans', () => {
    expect(deriveTodayStep([], '2026-08-17')).toBeNull();
  });

  it('selects the nearest target deterministically without mutating input', () => {
    const plans = [plan(), plan({ id: 'plan-2', clientRequestId: 'plan-2', title: 'Earlier Plan', targetDate: '2026-08-20' })];
    expect(deriveTodayStep(plans, '2026-08-17')?.planId).toBe('plan-2');
    expect(plans[0].id).toBe('plan-1');
  });

  it.each([[1, 30], [2, 30], [3, 45], [4, 60], [40, 60]])('bounds %s weekly hours to %s minutes', (weeklyHours, expected) => {
    expect(deriveTodayStep([plan({ weeklyHours })], '2026-08-17')?.durationMinutes).toBe(expected);
  });

  it('breaks equal-target ties by title and then stable id', () => {
    const plans = [
      plan({ id: 'b', clientRequestId: 'b', title: 'Same Plan' }),
      plan({ id: 'a', clientRequestId: 'a', title: 'Same Plan' })
    ];
    expect(deriveTodayStep(plans, '2026-08-17')?.planId).toBe('a');
  });

  it('uses a stable date-and-Plan completion id', () => {
    expect(deriveTodayStep([plan()], '2026-08-17')?.completionId).toBe('2026-08-17_plan-1_first-proof-v1');
  });
});
