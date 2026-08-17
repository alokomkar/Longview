import { describe, expect, it } from 'vitest';
import { canApproveRun, parseApprovedDay, parseDayApprovalResult } from './types';
import type { ScheduleRun } from '../scheduleRun/types';

const day = {
  schemaVersion: 1, selectedDate: '2026-08-17', revision: 1, sourceRunId: 'run-1',
  capacityMinutes: 120, totalMinutes: 60, status: 'approved', approvalEventId: 'day-approval-1',
  blocks: [{ order: 1, planId: 'plan-1', planTitle: 'Launch Longview', title: 'Define the first proof', durationMinutes: 60 }]
};

const run = {
  schemaVersion: 1, runId: 'run-1', requestId: 'request-1', selectedDate: '2026-08-17',
  status: 'succeeded', checkpoint: 4, checkpointLabel: 'Result published', retryOf: null, failure: null,
  proposal: { selectedDate: '2026-08-17', capacityMinutes: 120, totalMinutes: 60,
    rationale: 'The nearest active target comes first.', blocks: day.blocks }
} as ScheduleRun;

describe('approved day contracts', () => {
  it('accepts exact ordered totals and a correlated approval result', () => {
    expect(parseApprovedDay(day)?.revision).toBe(1);
    expect(parseDayApprovalResult({ schemaVersion: 1, idempotencyKey: 'day-approval-1', duplicate: false, approvedDay: day })?.approvedDay.sourceRunId).toBe('run-1');
    expect(canApproveRun(run)).toBe(true);
  });

  it.each([
    { ...day, revision: 0 },
    { ...day, blocks: [{ ...day.blocks[0], order: 2 }] },
    { ...day, totalMinutes: 61 },
    { ...day, status: 'draft' }
  ])('rejects malformed day %#', value => expect(parseApprovedDay(value)).toBeNull());

  it('rejects non-terminal and uncorrelated results', () => {
    expect(canApproveRun({ ...run, status: 'failed', proposal: null })).toBe(false);
    expect(parseDayApprovalResult({ schemaVersion: 1, idempotencyKey: 'short', duplicate: false, approvedDay: day })).toBeNull();
  });
});
