import { describe, expect, it, vi } from 'vitest';
import { createManagedDayBreakGateway } from './managedGateway';
import { DayBreakConflictError, type DayBreakRequest } from './types';

const carryover = {
  order: 1, planId: 'plan-1', planTitle: 'Launch Longview', title: 'Define the first proof',
  durationMinutes: 60, destinationDate: '2026-08-18', scheduleVersion: 1
};
const preview = { schemaVersion: 1, selectedDate: '2026-08-17', expectedDayRevision: 1, sourceApprovalEventId: 'approval-1', carryovers: [carryover] };

describe('managed day break gateway', () => {
  it('uses authenticated preview and confirmation endpoints', async () => {
    const request: DayBreakRequest = { schemaVersion: 1, idempotencyKey: 'break-key-1', expectedDayRevision: 1, carryovers: [carryover] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        schemaVersion: 1, idempotencyKey: 'break-key-1', duplicate: false, carryovers: [carryover],
        breakDay: { schemaVersion: 1, selectedDate: '2026-08-17', revision: 2, sourceRunId: 'run-1', capacityMinutes: 120, totalMinutes: 60, status: 'break', approvalEventId: 'approval-1', breakEventId: 'break-key-1', carryoverCount: 1, blocks: [{ order: 1, planId: 'plan-1', planTitle: 'Launch Longview', title: 'Define the first proof', durationMinutes: 60 }] }
      }), { status: 200 }));
    const gateway = createManagedDayBreakGateway('http://api.test', async () => 'token', fetcher);
    expect((await gateway.preview('2026-08-17', new AbortController().signal)).carryovers).toHaveLength(1);
    expect((await gateway.confirm('2026-08-17', request, new AbortController().signal)).breakDay.status).toBe('break');
    expect(fetcher.mock.calls[0][0]).toBe('http://api.test/v1/clara/approved-days/2026-08-17/break-preview');
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer token');
  });

  it('maps conflict reasons and rejects malformed success', async () => {
    const conflictGateway = createManagedDayBreakGateway('', async () => 'token', vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'future-approved' }), { status: 409 })));
    await expect(conflictGateway.preview('2026-08-17', new AbortController().signal))
      .rejects.toEqual(expect.objectContaining<Partial<DayBreakConflictError>>({ reason: 'future-approved' }));
    const malformed = createManagedDayBreakGateway('', async () => 'token', vi.fn(async () =>
      new Response(JSON.stringify({ ...preview, carryovers: [] }), { status: 200 })));
    await expect(malformed.preview('2026-08-17', new AbortController().signal)).rejects.toThrow('validation');
  });
});
