import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import type { TodayStep } from './deriveTodayStep';
import { pendingCompletionFromStep, type TodayOutbox, type TodayPendingCompletion } from './outbox';
import type { TodayCompletion, TodayGateway } from './types';
import { TodayCompletionValidationError } from './types';
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

const setOnline = (online: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });

function memoryOutbox(initial: TodayPendingCompletion | null = null) {
  let stored = initial;
  const outbox: TodayOutbox = {
    get: vi.fn(async (owner, value) => stored && stored.ownerUid === owner.uid && stored.completion.id === value.completionId ? stored : null),
    put: vi.fn(async (owner, value) => {
      stored ??= pendingCompletionFromStep(owner, value, 1);
      return stored;
    }),
    recordFailure: vi.fn(async (_owner, _value, failure) => {
      if (!stored) throw new Error('missing');
      stored = { ...stored, attemptCount: stored.attemptCount + 1, lastFailure: failure };
      return stored;
    }),
    remove: vi.fn(async () => { stored = null; }),
    clearOwner: vi.fn(async ownerUid => { if (stored?.ownerUid === ownerUid) stored = null; })
  };
  return { outbox, stored: () => stored };
}

describe('useTodayCompletion', () => {
  beforeEach(() => setOnline(true));

  it('never exposes a previous step or owner completion after the step changes', async () => {
    const first = step('plan-1');
    const second = step('plan-2');
    const gateway: TodayGateway = { get: vi.fn(async (_user, value) => completion(value)), complete: vi.fn() };
    const { outbox } = memoryOutbox();
    const { result, rerender } = renderHook(({ value }) => useTodayCompletion(user, value, gateway, outbox, true), { initialProps: { value: first } });
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    expect(result.current.snapshot.completion?.planId).toBe('plan-1');
    rerender({ value: second });
    expect(result.current.snapshot.completion).toBeNull();
    await waitFor(() => expect(result.current.snapshot.completion?.planId).toBe('plan-2'));
  });

  it('does not write when no step is available', async () => {
    const gateway: TodayGateway = { get: vi.fn(), complete: vi.fn() };
    const { outbox } = memoryOutbox();
    const { result } = renderHook(() => useTodayCompletion(user, null, gateway, outbox, true));
    await act(async () => expect(await result.current.complete()).toBe(false));
    expect(gateway.complete).not.toHaveBeenCalled();
    expect(outbox.put).not.toHaveBeenCalled();
  });

  it.each([false, true])('exposes the durable result when duplicate is %s', async duplicate => {
    const value = step('plan-1');
    const saved = completion(value);
    const gateway: TodayGateway = { get: vi.fn(async () => null), complete: vi.fn(async () => ({ completion: saved, duplicate })) };
    const { outbox } = memoryOutbox();
    const { result } = renderHook(() => useTodayCompletion(user, value, gateway, outbox, true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(async () => expect(await result.current.complete()).toBe(true));
    expect(result.current.snapshot).toEqual({ status: 'ready', completion: saved, stepId: value.completionId, duplicate });
  });

  it('saves exactly one local item while offline and restores it without a network call', async () => {
    setOnline(false);
    const value = step('plan-1');
    const gateway: TodayGateway = { get: vi.fn(), complete: vi.fn() };
    const memory = memoryOutbox();
    const { result, unmount } = renderHook(() => useTodayCompletion(user, value, gateway, memory.outbox, true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(async () => expect(await result.current.complete()).toBe(true));
    expect(result.current.syncStatus).toBe('pending');
    expect(result.current.pending?.attemptCount).toBe(0);
    await act(async () => expect(await result.current.complete()).toBe(true));
    expect(memory.outbox.put).toHaveBeenCalledTimes(2);
    expect(memory.stored()?.key).toBe(`owner::${value.completionId}`);
    expect(gateway.get).not.toHaveBeenCalled();
    expect(gateway.complete).not.toHaveBeenCalled();
    unmount();
    const restored = renderHook(() => useTodayCompletion(user, value, gateway, memory.outbox, true));
    await waitFor(() => expect(restored.result.current.syncStatus).toBe('pending'));
    expect(restored.result.current.pending?.completion.id).toBe(value.completionId);
  });

  it('keeps the step open when the local write fails', async () => {
    setOnline(false);
    const value = step('plan-1');
    const { outbox } = memoryOutbox();
    vi.mocked(outbox.put).mockRejectedValueOnce(new Error('quota'));
    const gateway: TodayGateway = { get: vi.fn(), complete: vi.fn() };
    const { result } = renderHook(() => useTodayCompletion(user, value, gateway, outbox, true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(async () => expect(await result.current.complete()).toBe(false));
    expect(result.current.saveFailed).toBe(true);
    expect(result.current.pending).toBeNull();
    expect(result.current.snapshot.completion).toBeNull();
  });

  it.each([false, true])('syncs on reconnect and clears the queue after a validated duplicate=%s proof', async duplicate => {
    setOnline(false);
    const value = step('plan-1');
    const saved = completion(value);
    const gateway: TodayGateway = { get: vi.fn(), complete: vi.fn(async () => ({ completion: saved, duplicate })) };
    const memory = memoryOutbox();
    const { result } = renderHook(() => useTodayCompletion(user, value, gateway, memory.outbox, true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(async () => { await result.current.complete(); });
    setOnline(true);
    act(() => globalThis.dispatchEvent(new Event('online')));
    await waitFor(() => expect(result.current.snapshot.completion).toEqual(saved));
    expect(result.current.snapshot.status === 'ready' && result.current.snapshot.duplicate).toBe(duplicate);
    await waitFor(() => expect(result.current.pending).toBeNull());
    expect(memory.outbox.remove).toHaveBeenCalledTimes(1);
  });

  it.each([new Error('network'), Object.assign(new Error('deadline'), { code: 'firestore/deadline-exceeded' })])('shows retry state and preserves the item after retryable failure %s', async failure => {
    setOnline(false);
    const value = step('plan-1');
    const gateway: TodayGateway = { get: vi.fn(), complete: vi.fn(async () => { throw failure; }) };
    const memory = memoryOutbox();
    const { result } = renderHook(() => useTodayCompletion(user, value, gateway, memory.outbox, true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(async () => { await result.current.complete(); });
    setOnline(true);
    act(() => globalThis.dispatchEvent(new Event('online')));
    await waitFor(() => expect(result.current.syncStatus).toBe('retry'));
    expect(result.current.pending?.attemptCount).toBe(1);
    expect(memory.stored()?.lastFailure).toBe('unavailable');
  });

  it('blocks malformed or unauthorized results without deleting or repeatedly retrying', async () => {
    setOnline(false);
    const value = step('plan-1');
    const gateway: TodayGateway = { get: vi.fn(), complete: vi.fn(async () => { throw new TodayCompletionValidationError(); }) };
    const memory = memoryOutbox();
    const { result } = renderHook(() => useTodayCompletion(user, value, gateway, memory.outbox, true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(async () => { await result.current.complete(); });
    setOnline(true);
    act(() => globalThis.dispatchEvent(new Event('online')));
    await waitFor(() => expect(result.current.syncStatus).toBe('blocked'));
    expect(memory.stored()).not.toBeNull();
    expect(memory.outbox.remove).not.toHaveBeenCalled();
    expect(memory.outbox.recordFailure).not.toHaveBeenCalled();
  });

  it('coalesces concurrent reconnect and foreground triggers into one request', async () => {
    setOnline(false);
    const value = step('plan-1');
    let resolve!: (result: { completion: TodayCompletion; duplicate: boolean }) => void;
    const complete = vi.fn(() => new Promise<{ completion: TodayCompletion; duplicate: boolean }>(next => { resolve = next; }));
    const gateway: TodayGateway = { get: vi.fn(), complete };
    const memory = memoryOutbox();
    const { result } = renderHook(() => useTodayCompletion(user, value, gateway, memory.outbox, true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(async () => { await result.current.complete(); });
    setOnline(true);
    act(() => {
      globalThis.dispatchEvent(new Event('online'));
      globalThis.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(result.current.syncStatus).toBe('syncing'));
    expect(complete).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ completion: completion(value), duplicate: false }));
    await waitFor(() => expect(result.current.snapshot.completion).not.toBeNull());
  });

  it('keeps verified proof visible and retries safe cleanup after a partial local failure', async () => {
    const value = step('plan-1');
    const saved = completion(value);
    const memory = memoryOutbox(pendingCompletionFromStep(user, value, 1));
    vi.mocked(memory.outbox.remove).mockRejectedValueOnce(new Error('transaction aborted'));
    const gateway: TodayGateway = {
      get: vi.fn(async () => saved),
      complete: vi.fn(async () => ({ completion: saved, duplicate: true }))
    };
    const { result } = renderHook(() => useTodayCompletion(user, value, gateway, memory.outbox, true));
    await waitFor(() => expect(result.current.snapshot.completion).toEqual(saved));
    expect(result.current.pending).not.toBeNull();
    act(() => globalThis.dispatchEvent(new Event('online')));
    await waitFor(() => expect(gateway.complete).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.pending).toBeNull());
    expect(memory.outbox.remove).toHaveBeenCalledTimes(2);
  });
});
