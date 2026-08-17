import { describe, expect, it } from 'vitest';
import { derivePortfolio } from './portfolio';
import type { Plan } from './types';

const plan = (id: string, targetDate: string, weeklyHours: number): Plan => ({
  id, clientRequestId: id, ownerUid: 'owner', workspaceId: 'default', title: `Plan ${id}`,
  outcome: 'Reach one observable and useful outcome.', why: 'Keep meaningful progress visible.',
  targetDate, weeklyHours, workingDays: ['mon'], status: 'active', schemaVersion: 2,
  scheduleVersion: 1
});

describe('derivePortfolio', () => {
  it('derives finite allocation shares and stable operating modes from target order', () => {
    const summary = derivePortfolio([
      plan('house', '2026-12-01', 2), plan('startup', '2026-09-01', 6), plan('learn', '2026-10-01', 4)
    ]);
    expect(summary.totalWeeklyHours).toBe(12);
    expect(summary.entries.map(entry => [entry.plan.id, entry.mode, entry.percent])).toEqual([
      ['startup', 'Focus', 50], ['learn', 'Maintain', 33], ['house', 'Prepare', 17]
    ]);
    expect(summary.recommendation).toContain('Plan startup');
  });

  it('handles empty and single-Plan portfolios without inventing capacity', () => {
    expect(derivePortfolio([])).toEqual({ entries: [], totalWeeklyHours: 0, recommendation: 'Create a Plan to start allocating your weekly time.' });
    const summary = derivePortfolio([plan('one', '2026-09-01', 5)]);
    expect(summary.entries[0]).toMatchObject({ mode: 'Focus', percent: 100 });
    expect(summary.recommendation).toContain('Protect Plan one');
  });
});
