import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApprovedDay } from '../approvedDay/types';
import { DayBreakConflictError, type DayBreakGateway, type DayBreakPreview } from './types';
import { useDayBreak } from './useDayBreak';

const day: ApprovedDay = {
  schemaVersion: 1, selectedDate: '2026-08-17', revision: 1, sourceRunId: 'run-1',
  capacityMinutes: 120, totalMinutes: 60, status: 'approved', approvalEventId: 'approval-1',
  blocks: [{ order: 1, planId: 'plan-1', planTitle: 'Launch Longview', title: 'Define the first proof', durationMinutes: 60 }]
};
const preview: DayBreakPreview = {
  schemaVersion: 1, selectedDate: '2026-08-17', expectedDayRevision: 1, sourceApprovalEventId: 'approval-1',
  carryovers: [{ order: 1, planId: 'plan-1', planTitle: 'Launch Longview', title: 'Define the first proof', durationMinutes: 60, destinationDate: '2026-08-18', scheduleVersion: 1 }]
};

describe('useDayBreak', () => {
  it('previews, confirms, and preserves one idempotency key for an unavailable retry', async () => {
    const confirm = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (_date, request) => ({ schemaVersion: 1, idempotencyKey: request.idempotencyKey, duplicate: false, carryovers: preview.carryovers, breakDay: { ...day, revision: 2, status: 'break', breakEventId: request.idempotencyKey, carryoverCount: 1 } }));
    const gateway: DayBreakGateway = { preview: vi.fn(async () => preview), confirm };
    const { result } = renderHook(() => useDayBreak(gateway));
    await act(() => result.current.preview(day));
    await waitFor(() => expect(result.current.snapshot.status).toBe('review'));
    await act(() => result.current.confirm());
    await waitFor(() => expect(result.current.snapshot.status).toBe('error'));
    await act(() => result.current.retry());
    await waitFor(() => expect(result.current.snapshot.status).toBe('success'));
    expect(confirm.mock.calls[0][1].idempotencyKey).toBe(confirm.mock.calls[1][1].idempotencyKey);
  });

  it('surfaces stale previews without confirming', async () => {
    const gateway: DayBreakGateway = {
      preview: vi.fn(async () => { throw new DayBreakConflictError('source-changed'); }), confirm: vi.fn()
    };
    const { result } = renderHook(() => useDayBreak(gateway));
    await act(() => result.current.preview(day));
    await waitFor(() => expect(result.current.snapshot).toEqual(expect.objectContaining({ status: 'error', failure: 'source-changed' })));
    expect(gateway.confirm).not.toHaveBeenCalled();
  });

  it('keeps one break key when confirmation times out and is recovered', async () => {
    const confirm = vi.fn()
      .mockImplementationOnce(async () => new Promise<never>(() => undefined))
      .mockImplementationOnce(async (_date, request) => ({ schemaVersion: 1, idempotencyKey: request.idempotencyKey, duplicate: true, carryovers: preview.carryovers, breakDay: { ...day, revision: 2, status: 'break', breakEventId: request.idempotencyKey, carryoverCount: 1 } }));
    const gateway: DayBreakGateway = { preview: vi.fn(async () => preview), confirm };
    const { result } = renderHook(() => useDayBreak(gateway, 5));
    await act(() => result.current.preview(day));
    act(() => { void result.current.confirm(); });
    await waitFor(() => expect(result.current.snapshot).toMatchObject({ status: 'error', failure: 'timeout' }));
    await act(() => result.current.retry());
    expect(result.current.snapshot.status).toBe('success');
    expect(confirm.mock.calls[1][1].idempotencyKey).toBe(confirm.mock.calls[0][1].idempotencyKey);
  });
});
