import { describe, expect, it, vi } from 'vitest';
import { createManagedApprovedDayGateway } from './managedGateway';
import { ApprovedDayConflictError } from './types';

const day = {
  schemaVersion: 1, selectedDate: '2026-08-17', revision: 1, sourceRunId: 'run-1',
  capacityMinutes: 120, totalMinutes: 60, status: 'approved', approvalEventId: 'day-approval-1',
  blocks: [{ order: 1, planId: 'plan-1', planTitle: 'Launch Longview', title: 'Define the first proof', durationMinutes: 60 }]
};

describe('managed approved-day gateway', () => {
  it('loads absence and validates a saved day', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(day), { status: 200 }));
    const gateway = createManagedApprovedDayGateway('http://api.test/', async () => 'token', fetcher);
    const signal = new AbortController().signal;
    expect(await gateway.get('2026-08-17', signal)).toBeNull();
    expect((await gateway.get('2026-08-17', signal))?.revision).toBe(1);
    expect(fetcher.mock.calls[1][1].headers).toMatchObject({ Authorization: 'Bearer token' });
  });

  it('sends the exact version guard and rejects conflicts or malformed responses', async () => {
    const request = { schemaVersion: 1 as const, idempotencyKey: 'day-approval-1', expectedDayRevision: 0, replaceCurrent: false };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ schemaVersion: 1, idempotencyKey: request.idempotencyKey, duplicate: false, approvedDay: day }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ invalid: true }), { status: 200 }));
    const gateway = createManagedApprovedDayGateway('http://api.test', async () => 'token', fetcher);
    const signal = new AbortController().signal;
    expect((await gateway.approve('run-1', request, signal)).approvedDay.revision).toBe(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(request);
    await expect(gateway.approve('run-1', request, signal)).rejects.toBeInstanceOf(ApprovedDayConflictError);
    await expect(gateway.approve('run-1', request, signal)).rejects.toThrow('failed validation');
  });
});
