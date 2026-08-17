import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleRun, ScheduleRunContext, ScheduleRunGateway } from './types';
import { useScheduleRun } from './useScheduleRun';

const context = { schemaVersion: 1, requestId: 'request-1', selectedDate: '2026-08-17', capacityMinutes: 60,
  retryOf: null, plans: [], steps: [] } as unknown as ScheduleRunContext;
const run = (status: ScheduleRun['status'], checkpoint: 1 | 2 | 3 | 4): ScheduleRun => ({
  schemaVersion: 1, runId: 'run-1', requestId: 'request-1', selectedDate: '2026-08-17', status,
  checkpoint, checkpointLabel: `Checkpoint ${checkpoint}`, retryOf: null, failure: null,
  proposal: status === 'succeeded' ? { selectedDate: '2026-08-17', capacityMinutes: 60, totalMinutes: 60,
    rationale: 'The nearest target comes first today.', blocks: [{ planId: 'one', planTitle: 'Plan one', title: 'Define proof', durationMinutes: 60 }] } : null
});

describe('useScheduleRun', () => {
  it('polls until terminal success', async () => {
    const gateway: ScheduleRunGateway = {
      start: vi.fn(async () => run('queued', 1)),
      get: vi.fn().mockResolvedValueOnce(run('running', 2)).mockResolvedValueOnce(run('succeeded', 4)),
      cancel: vi.fn()
    };
    const { result } = renderHook(() => useScheduleRun(gateway, 1));
    await act(async () => { await result.current.start(context); });
    await waitFor(() => expect(result.current.snapshot.status).toBe('succeeded'));
    expect(gateway.get).toHaveBeenCalledTimes(2);
  });

  it('cancels an active run and preserves a terminal cancellation', async () => {
    const gateway: ScheduleRunGateway = {
      start: vi.fn(async () => run('queued', 1)), get: vi.fn(),
      cancel: vi.fn(async () => run('cancelled', 1))
    };
    const { result } = renderHook(() => useScheduleRun(gateway, 1000));
    await act(async () => { await result.current.start(context); });
    await act(async () => { await result.current.cancel(); });
    expect(result.current.snapshot.status).toBe('cancelled');
    expect(gateway.get).not.toHaveBeenCalled();
  });
});
