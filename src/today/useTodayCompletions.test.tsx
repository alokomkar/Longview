import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import type { TodayStep } from './deriveTodayStep';
import type { TodayCompletion, TodayGateway } from './types';
import { useTodayCompletions } from './useTodayCompletions';

const user: AuthUser = { uid: 'owner', isAnonymous: false, displayName: 'Owner' };
const step = (id: string): TodayStep => ({
  completionId: `2026-08-17_${id}_first-proof-v1`, date: '2026-08-17', planId: id,
  planTitle: `Plan ${id}`, title: 'Define the first proof', description: 'Write one observable result.',
  durationMinutes: 60, targetDate: '2026-08-20'
});
const completion = (value: TodayStep): TodayCompletion => ({
  id: value.completionId, ownerUid: 'owner', workspaceId: 'default', planId: value.planId,
  stepKey: 'first-proof-v1', completedDate: value.date, durationMinutes: value.durationMinutes,
  status: 'completed', schemaVersion: 1
});

describe('useTodayCompletions', () => {
  it('loads every scheduled step and returns only completed ids', async () => {
    const first = step('one');
    const gateway: TodayGateway = {
      get: vi.fn(async (_user, value) => value.planId === 'one' ? completion(value) : null),
      complete: vi.fn()
    };
    const { result } = renderHook(() => useTodayCompletions(user, [first, step('two')], gateway, true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    expect([...result.current.snapshot.completedStepIds]).toEqual([first.completionId]);
    expect(gateway.get).toHaveBeenCalledTimes(2);
  });

  it('fails closed when any completion cannot be verified', async () => {
    const gateway: TodayGateway = { get: vi.fn(async () => { throw new Error('offline'); }), complete: vi.fn() };
    const { result } = renderHook(() => useTodayCompletions(user, [step('one')], gateway, true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('error'));
    expect(result.current.snapshot.completedStepIds.size).toBe(0);
  });

  it('never exposes completion results from an earlier step set', async () => {
    const resolvers = new Map<string, (value: TodayCompletion | null) => void>();
    const gateway: TodayGateway = {
      get: vi.fn((_user: AuthUser, value: TodayStep) => new Promise<TodayCompletion | null>(resolve => resolvers.set(value.planId, resolve))),
      complete: vi.fn()
    };
    const { result, rerender } = renderHook(
      ({ steps }) => useTodayCompletions(user, steps, gateway, true),
      { initialProps: { steps: [step('one')] } }
    );
    rerender({ steps: [step('two')] });
    await act(async () => { resolvers.get('one')?.(completion(step('one'))); });
    expect(result.current.snapshot.status).toBe('loading');
    await act(async () => { resolvers.get('two')?.(null); });
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    expect(result.current.snapshot.completedStepIds.size).toBe(0);
  });
});
