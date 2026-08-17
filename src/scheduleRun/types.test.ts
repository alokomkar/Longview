import { describe, expect, it } from 'vitest';
import { derivePortfolio } from '../plan/portfolio';
import type { Plan } from '../plan/types';
import { buildScheduleRunContext, parseScheduleRun } from './types';

const plan = (id: string, hours: number): Plan => ({
  id, clientRequestId: id, ownerUid: 'owner', workspaceId: 'default', title: `Plan ${id}`,
  outcome: 'Produce one observable and reviewed result.', why: 'Create useful evidence.',
  targetDate: '2026-08-20', weeklyHours: hours, workingDays: ['mon'], status: 'active',
  schemaVersion: 2, scheduleVersion: 1
});

describe('schedule run contract', () => {
  it('includes only eligible plan-scoped context', () => {
    const context = buildScheduleRunContext(derivePortfolio([plan('one', 4), plan('two', 2)]).entries, '2026-08-17', 120, 'request-1');
    expect(context?.plans.map(value => value.mode)).toEqual(['Focus', 'Maintain']);
    expect(context?.steps.map(value => value.planId)).toEqual(['one', 'two']);
    expect(context).not.toHaveProperty('ownerUid');
  });

  it('rejects days without work and invalid capacity bounds', () => {
    const entries = derivePortfolio([plan('one', 4)]).entries;
    expect(buildScheduleRunContext(entries, '2026-08-18', 120, 'request-1')).toBeNull();
    expect(buildScheduleRunContext(entries, '2026-08-17', 29, 'request-1')).toBeNull();
  });

  it('excludes completed steps and returns no empty run context', () => {
    const entries = derivePortfolio([plan('one', 4), plan('two', 2)]).entries;
    const oneId = '2026-08-17_one_first-proof-v1';
    expect(buildScheduleRunContext(entries, '2026-08-17', 120, 'request-1', null, new Set([oneId]))?.steps.map(step => step.planId)).toEqual(['two']);
    const all = new Set([oneId, '2026-08-17_two_first-proof-v1']);
    expect(buildScheduleRunContext(entries, '2026-08-17', 120, 'request-1', null, all)).toBeNull();
  });

  it('fails closed on mixed or oversized terminal responses', () => {
    const valid = {
      schemaVersion: 1, runId: 'run-1', requestId: 'request-1', selectedDate: '2026-08-17',
      status: 'succeeded', checkpoint: 4, checkpointLabel: 'Result published', retryOf: null, failure: null,
      proposal: { selectedDate: '2026-08-17', capacityMinutes: 60, totalMinutes: 60,
        rationale: 'The nearest target comes first today.',
        blocks: [{ planId: 'one', planTitle: 'Plan one', title: 'Define proof', durationMinutes: 60 }] }
    };
    expect(parseScheduleRun(valid)?.status).toBe('succeeded');
    expect(parseScheduleRun({ ...valid, status: 'cancelled' })).toBeNull();
    expect(parseScheduleRun({ ...valid, proposal: { ...valid.proposal, totalMinutes: 61 } })).toBeNull();
  });
});
