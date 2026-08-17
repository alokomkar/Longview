import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaraGatewayTimeoutError, type ClaraContext, type ClaraGateway } from './types';
import { useClaraRecommendation } from './useClaraRecommendation';

const context: ClaraContext = {
  schemaVersion: 1, requestId: 'request-1', scope: 'today-step',
  plan: { id: 'plan-1', title: 'Launch Longview', outcome: 'Release a tested PWA.', targetDate: '2026-08-20', weeklyHours: 4, workingDays: ['mon', 'fri'], scheduleVersion: 2 },
  step: { title: 'Define proof', description: 'Write one result.', durationMinutes: 60, date: '2026-08-17' }
};
const response = (requestId = 'request-1') => ({
  schemaVersion: 1, requestId, sourcePlanId: 'plan-1', headline: 'Protect the proof',
  recommendation: 'Finish the selected step before adding work.',
  rationale: 'It creates evidence for the nearest active target.', confidence: 'medium',
  requiresClarification: false, sourceFacts: ['Plan: Launch Longview'], proposedChange: null
});

describe('useClaraRecommendation', () => {
  beforeEach(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }));

  it('cancels an in-flight request without exposing its late result', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const gateway: ClaraGateway = { recommend: vi.fn(() => new Promise(done => { resolve = done; })) };
    const { result } = renderHook(() => useClaraRecommendation(gateway));
    act(() => { void result.current.ask(context); });
    expect(result.current.snapshot.status).toBe('loading');
    act(() => result.current.cancel());
    await act(async () => resolve(response()));
    expect(result.current.snapshot.status).toBe('idle');
  });

  it('fails closed on malformed output and retries with a new request id', async () => {
    const recommend = vi.fn().mockResolvedValueOnce({ invalid: true }).mockImplementation(async input => response(input.requestId));
    const { result } = renderHook(() => useClaraRecommendation({ recommend }));
    await act(async () => { await result.current.ask(context); });
    expect(result.current.snapshot).toMatchObject({ status: 'error', failure: 'malformed' });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    expect(recommend.mock.calls[1][0].requestId).not.toBe('request-1');
  });

  it('reports timeout and does not surface a late response', async () => {
    const gateway: ClaraGateway = { recommend: vi.fn((_context, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))) };
    const { result } = renderHook(() => useClaraRecommendation(gateway, 5));
    act(() => { void result.current.ask(context); });
    await waitFor(() => expect(result.current.snapshot).toMatchObject({ status: 'error', failure: 'timeout' }));
  });

  it('reports the managed API timeout before the browser guard expires', async () => {
    const gateway: ClaraGateway = {
      recommend: vi.fn(async () => { throw new ClaraGatewayTimeoutError(); })
    };
    const { result } = renderHook(() => useClaraRecommendation(gateway));
    await act(async () => { await result.current.ask(context); });
    expect(result.current.snapshot).toMatchObject({ status: 'error', failure: 'timeout' });
  });

  it.each([
    ['offline', false, 'offline'],
    ['service failure', true, 'unavailable']
  ])('reports %s without a recommendation', async (_name, online, failure) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
    const gateway: ClaraGateway = { recommend: vi.fn(async () => { throw new Error('failed'); }) };
    const { result } = renderHook(() => useClaraRecommendation(gateway));
    await act(async () => { await result.current.ask(context); });
    expect(result.current.snapshot).toMatchObject({ status: 'error', failure, recommendation: null });
  });
});
