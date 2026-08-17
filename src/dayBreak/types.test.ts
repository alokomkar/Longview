import { describe, expect, it } from 'vitest';
import { parseApprovedDay } from '../approvedDay/types';
import { parseDayBreakPreview, parseDayBreakResult } from './types';

const carryover = {
  order: 1, planId: 'plan-1', planTitle: 'Launch Longview', title: 'Define the first proof',
  durationMinutes: 60, destinationDate: '2026-08-18', scheduleVersion: 1
};
const breakDay = {
  schemaVersion: 1, selectedDate: '2026-08-17', revision: 2, sourceRunId: 'run-1',
  capacityMinutes: 120, totalMinutes: 60, status: 'break', approvalEventId: 'approval-1',
  breakEventId: 'break-key-1', carryoverCount: 1,
  blocks: [{ order: 1, planId: 'plan-1', planTitle: 'Launch Longview', title: 'Define the first proof', durationMinutes: 60 }]
};

describe('day break parsing', () => {
  it('accepts a consecutive reviewed preview', () => {
    expect(parseDayBreakPreview({
      schemaVersion: 1, selectedDate: '2026-08-17', expectedDayRevision: 1,
      sourceApprovalEventId: 'approval-1', carryovers: [carryover]
    })?.carryovers[0].destinationDate).toBe('2026-08-18');
    expect(parseDayBreakPreview({
      schemaVersion: 1, selectedDate: '2026-08-17', expectedDayRevision: 1,
      sourceApprovalEventId: 'approval-1', carryovers: [{ ...carryover, order: 2 }]
    })).toBeNull();
  });

  it('requires a break day matching the carryover count', () => {
    const value = { schemaVersion: 1, idempotencyKey: 'break-key-1', duplicate: false, breakDay, carryovers: [carryover] };
    expect(parseDayBreakResult(value, parseApprovedDay)?.breakDay.status).toBe('break');
    expect(parseDayBreakResult({ ...value, breakDay: { ...breakDay, carryoverCount: 2 } }, parseApprovedDay)).toBeNull();
  });
});
