import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import type { TodayStep } from './deriveTodayStep';
import type { TodayCompletion, TodayGateway } from './types';
import { useTodayCompletion } from './useTodayCompletion';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const step = (id: string): TodayStep => ({
  completionId: `2026-08-17_${id}_first-proof-v1`, date: '2026-08-17', planId: id,
  planTitle: id, title: 'First proof', description: 'Describe proof.', durationMinutes: 30,
  targetDate: '2026-09-30'
});
const completion = (value: TodayStep): TodayCompletion => ({
  id: value.completionId, ownerUid: 'owner', workspaceId: 'default', planId: value.planId,
  stepKey: 'first-proof-v1', completedDate: value.date, durationMinutes: value.durationMinutes,
  status: 'completed', schemaVersion: 1
});

describe('useTodayCompletion', () => {
  it('never exposes a previous step completion after the step changes', async () => {
    const first = step('plan-1');
    const second = step('plan-2');
    const gateway: TodayGateway = { get: vi.fn(async (_user, value) => completion(value)), complete: vi.fn() };
    const { result, rerender } = renderHook(({ value }) => useTodayCompletion(user, value, gateway, true), { initialProps: { value: first } });
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    expect(result.current.snapshot.completion?.planId).toBe('plan-1');
    rerender({ value: second });
    expect(result.current.snapshot.completion).toBeNull();
    await waitFor(() => expect(result.current.snapshot.completion?.planId).toBe('plan-2'));
  });

  it('does not write when no step is available', async () => {
    const gateway: TodayGateway = { get: vi.fn(), complete: vi.fn() };
    const { result } = renderHook(() => useTodayCompletion(user, null, gateway, true));
    await act(async () => expect(await result.current.complete()).toBe(false));
    expect(gateway.complete).not.toHaveBeenCalled();
  });
});
