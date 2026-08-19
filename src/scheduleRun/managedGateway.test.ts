import { describe, expect, it, vi } from 'vitest';
import { createManagedScheduleRunGateway } from './managedGateway';
import { ScheduleRunMalformedError, type ScheduleRunContext } from './types';

const context = {
  schemaVersion: 1, requestId: 'request-1', selectedDate: '2026-08-17', capacityMinutes: 60,
  retryOf: null, plans: [{ id: 'plan-1', title: 'Plan one', targetDate: '2026-08-20', weeklyHours: 4, workingDays: ['mon'], mode: 'Focus' }],
  steps: [{ planId: 'plan-1', planTitle: 'Plan one', title: 'Define proof', description: 'Write one result.', durationMinutes: 60 }]
} satisfies ScheduleRunContext;
const queued = {
  schemaVersion: 1, runId: 'run-1', requestId: 'request-1', selectedDate: '2026-08-17',
  status: 'queued', checkpoint: 1, checkpointLabel: 'Run queued', retryOf: null, proposal: null, failure: null
};

describe('managed schedule run gateway', () => {
  it('sends Firebase auth and the abort signal to start and cancel', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(queued), { status: 200 }));
    const gateway = createManagedScheduleRunGateway('https://api.example.test/', async () => ({ getToken: async () => 'token-1' }), fetcher);
    const controller = new AbortController();
    await gateway.start(context, controller.signal);
    await gateway.cancel('run-1', controller.signal);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.example.test/v1/clara/schedule-runs');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ signal: controller.signal, headers: { Authorization: 'Bearer token-1' } });
    expect(fetcher.mock.calls[1][0]).toContain('/run-1/cancel');
    expect(fetcher.mock.calls[1][1]).toMatchObject({ signal: controller.signal });
  });

  it('rejects malformed success payloads with a typed failure', async () => {
    const gateway = createManagedScheduleRunGateway('', async () => ({ getToken: async () => 'token' }), vi.fn(async () => new Response('{}', { status: 200 })));
    await expect(gateway.start(context, new AbortController().signal)).rejects.toBeInstanceOf(ScheduleRunMalformedError);
  });
});
