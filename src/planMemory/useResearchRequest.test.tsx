import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import { useResearchRequest } from './useResearchRequest';
import type { ResearchGateway, ResearchRequest } from './types';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const request: ResearchRequest = {
  schemaVersion: 1, requestId: 'request-123', existingResearchIds: [],
  plan: { id: 'plan-123', title: 'Launch Longview', outcome: 'Release a tested workflow to users.', why: 'Real evidence matters.', targetDate: '2026-09-30' }
};
const response = {
  schemaVersion: 1, requestId: 'request-123', sourcePlanId: 'plan-123', cards: [{
    schemaVersion: 1, researchId: 'research-123', requestId: 'request-123', sourcePlanId: 'plan-123',
    headline: 'Visible first value improves activation', finding: 'Users continue after seeing one meaningful outcome.',
    source: { kind: 'web', title: 'Activation research', locator: 'https://example.com/research', domain: 'example.com', publishedAt: null, retrievedAt: '2026-08-19T08:00:00.000Z' }
  }]
};

describe('useResearchRequest', () => {
  beforeEach(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }));
  afterEach(() => vi.useRealTimers());

  it('publishes only a validated, request-bound response', async () => {
    const gateway: ResearchGateway = { request: vi.fn(async () => response) };
    const { result } = renderHook(() => useResearchRequest(user, gateway));
    await act(() => result.current.request(request));
    expect(result.current.snapshot).toMatchObject({ status: 'ready', response: { cards: [{ researchId: 'research-123' }] } });
  });

  it.each([
    [{ ...response, requestId: 'other-request' }, 'malformed'],
    [{ ...response, cards: [{ ...response.cards[0], source: { ...response.cards[0].source, locator: '' } }] }, 'malformed']
  ])('fails closed for malformed or mismatched output', async (value, failure) => {
    const gateway: ResearchGateway = { request: vi.fn(async () => value) };
    const { result } = renderHook(() => useResearchRequest(user, gateway));
    await act(() => result.current.request(request));
    expect(result.current.snapshot).toMatchObject({ status: 'error', failure });
  });

  it('cancels without publishing a late response', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const gateway: ResearchGateway = { request: vi.fn((_user, _request, signal) => new Promise((done, reject) => {
      resolve = done;
      signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
    })) };
    const { result } = renderHook(() => useResearchRequest(user, gateway));
    act(() => { void result.current.request(request); });
    await waitFor(() => expect(result.current.snapshot.status).toBe('loading'));
    act(() => result.current.cancel());
    await act(async () => resolve(response));
    expect(result.current.snapshot.status).toBe('idle');
  });

  it('times out and aborts the underlying request', async () => {
    vi.useFakeTimers();
    const aborted = vi.fn();
    const gateway: ResearchGateway = { request: vi.fn((_user, _request, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { aborted(); reject(new DOMException('Cancelled', 'AbortError')); });
    })) };
    const { result } = renderHook(() => useResearchRequest(user, gateway, 50));
    act(() => { void result.current.request(request); });
    await act(async () => { await vi.advanceTimersByTimeAsync(51); });
    expect(result.current.snapshot).toMatchObject({ status: 'error', failure: 'timeout' });
    expect(aborted).toHaveBeenCalledOnce();
  });

  it('distinguishes offline and unavailable failures and retries the same request', async () => {
    const gateway: ResearchGateway = { request: vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(response) };
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const { result } = renderHook(() => useResearchRequest(user, gateway));
    await act(() => result.current.request(request));
    expect(result.current.snapshot).toMatchObject({ status: 'error', failure: 'offline' });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    expect(gateway.request).toHaveBeenCalledTimes(2);
  });
});
