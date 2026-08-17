import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleRun } from '../scheduleRun/types';
import type { ApprovedDayGateway } from './types';
import { useApprovedDay } from './useApprovedDay';

const day = {
  schemaVersion: 1 as const, selectedDate: '2026-08-17', revision: 1, sourceRunId: 'run-1',
  capacityMinutes: 120, totalMinutes: 60, status: 'approved' as const, approvalEventId: 'day-approval-1',
  blocks: [{ order: 1, planId: 'plan-1', planTitle: 'Launch Longview', title: 'Define the first proof', durationMinutes: 60 }]
};
const run = {
  schemaVersion: 1 as const, runId: 'run-1', requestId: 'request-1', selectedDate: '2026-08-17',
  status: 'succeeded' as const, checkpoint: 4 as const, checkpointLabel: 'Result published', retryOf: null, failure: null,
  proposal: { selectedDate: '2026-08-17', capacityMinutes: 120, totalMinutes: 60,
    rationale: 'The nearest active target comes first.', blocks: day.blocks }
} satisfies ScheduleRun;

describe('useApprovedDay', () => {
  it('loads a persisted day and retains it when refresh fails', async () => {
    const get = vi.fn().mockResolvedValueOnce(day).mockRejectedValueOnce(new Error('offline'));
    const gateway = { get, approve: vi.fn() } as ApprovedDayGateway;
    const { result } = renderHook(() => useApprovedDay(gateway, '2026-08-17', true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(() => result.current.reload());
    expect(result.current.snapshot).toMatchObject({ status: 'error', day: { revision: 1 } });
  });

  it('reuses one idempotency key after failure and publishes the committed result', async () => {
    const approve = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (_runId, request) => ({ schemaVersion: 1, idempotencyKey: request.idempotencyKey, duplicate: false, approvedDay: day }));
    const gateway: ApprovedDayGateway = { get: vi.fn(async () => null), approve };
    const { result } = renderHook(() => useApprovedDay(gateway, '2026-08-17', true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(() => result.current.approve(run));
    expect(result.current.approval).toMatchObject({ status: 'error', failure: 'unavailable' });
    await act(() => result.current.retryApproval());
    expect(result.current.approval.status).toBe('success');
    expect(approve.mock.calls[0][1].idempotencyKey).toBe(approve.mock.calls[1][1].idempotencyKey);
    expect(approve.mock.calls[0][1]).toMatchObject({ expectedDayRevision: 0, replaceCurrent: false });
  });

  it('uses the current revision only for an explicit replacement', async () => {
    const replacement = { ...day, revision: 2, sourceRunId: 'run-2', approvalEventId: 'day-approval-2' };
    const approve = vi.fn(async (_runId, request) => ({ schemaVersion: 1 as const, idempotencyKey: request.idempotencyKey, duplicate: false, approvedDay: replacement }));
    const gateway: ApprovedDayGateway = { get: vi.fn(async () => day), approve };
    const replacementRun = { ...run, runId: 'run-2' };
    const { result } = renderHook(() => useApprovedDay(gateway, '2026-08-17', true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(() => result.current.approve(replacementRun));
    expect(approve.mock.calls[0][1]).toMatchObject({ expectedDayRevision: 1, replaceCurrent: true });
    expect(result.current.snapshot.day?.revision).toBe(2);
  });
});
