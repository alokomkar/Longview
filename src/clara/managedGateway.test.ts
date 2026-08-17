import { describe, expect, it, vi } from 'vitest';
import { ClaraGatewayTimeoutError, type ClaraContext } from './types';
import { createManagedClaraGateway } from './managedGateway';

const context: ClaraContext = {
  schemaVersion: 1, requestId: 'request-1', scope: 'today-step',
  plan: { id: 'plan-1', title: 'Launch Longview', outcome: 'Release a tested PWA.', targetDate: '2026-08-20', weeklyHours: 4 },
  step: { title: 'Define proof', description: 'Write one result.', durationMinutes: 60, date: '2026-08-17' }
};
const recommendation = (requestId = 'request-1', sourcePlanId = 'plan-1') => ({
  schemaVersion: 1, requestId, sourcePlanId, headline: 'Protect the smallest proof',
  recommendation: 'Finish the selected step before adding more work.',
  rationale: 'It creates evidence for the nearest active target.', confidence: 'medium',
  requiresClarification: false, sourceFacts: ['Plan: Launch Longview'], proposedChange: null
});
const identity = (uid = 'owner-1', token = 'id-token') => async () => ({
  uid, getToken: vi.fn(async () => token)
});

describe('managed Clara gateway', () => {
  it('sends the Firebase token and exact bounded context', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const gateway = createManagedClaraGateway('https://clara.example.test/', identity(), fetcher);
    const controller = new AbortController();
    await expect(gateway.recommend(context, controller.signal)).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith('https://clara.example.test/v1/clara/recommendations', {
      method: 'POST',
      headers: { Authorization: 'Bearer id-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
      signal: controller.signal
    });
  });

  it('does not call the API when token retrieval fails', async () => {
    const fetcher = vi.fn();
    const gateway = createManagedClaraGateway('https://clara.example.test', async () => { throw new Error('signed out'); }, fetcher);
    await expect(gateway.recommend(context, new AbortController().signal)).rejects.toThrow('signed out');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reuses one validated recommendation for the same Plan context and rewrites only the request id', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(recommendation()), { status: 200 }));
    const gateway = createManagedClaraGateway('https://clara.example.test', identity(), fetcher);
    await expect(gateway.recommend(context, new AbortController().signal)).resolves.toEqual(recommendation());
    await expect(gateway.recommend({ ...context, requestId: 'request-2' }, new AbortController().signal))
      .resolves.toEqual(recommendation('request-2'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('misses the Plan cache for a changed user, Plan context, another Plan, or expired entry', async () => {
    let timestamp = 1000;
    const fetcher = vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as ClaraContext;
      return new Response(JSON.stringify(recommendation(request.requestId, request.plan.id)), { status: 200 });
    });
    let uid = 'owner-1';
    const gateway = createManagedClaraGateway(
      'https://clara.example.test', async () => ({ uid, getToken: async () => 'token' }), fetcher,
      { ttlMs: 100, now: () => timestamp }
    );
    await gateway.recommend(context, new AbortController().signal);
    await gateway.recommend({ ...context, requestId: 'request-2', step: { ...context.step, durationMinutes: 30 } }, new AbortController().signal);
    uid = 'owner-2';
    await gateway.recommend({ ...context, requestId: 'request-3' }, new AbortController().signal);
    uid = 'owner-1'; timestamp = 1101;
    await gateway.recommend({ ...context, requestId: 'request-4' }, new AbortController().signal);
    await gateway.recommend({
      ...context, requestId: 'request-5',
      plan: { ...context.plan, id: 'plan-2', title: 'Prepare launch evidence' }
    }, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it('keeps only one context entry per Plan', async () => {
    const fetcher = vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as ClaraContext;
      return new Response(JSON.stringify(recommendation(request.requestId, request.plan.id)), { status: 200 });
    });
    const gateway = createManagedClaraGateway('https://clara.example.test', identity(), fetcher);
    await gateway.recommend(context, new AbortController().signal);
    await gateway.recommend({ ...context, requestId: 'request-2', step: { ...context.step, durationMinutes: 30 } }, new AbortController().signal);
    await gateway.recommend({ ...context, requestId: 'request-3' }, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('evicts the least recently used Plan when the Plan bound is reached', async () => {
    const fetcher = vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as ClaraContext;
      return new Response(JSON.stringify(recommendation(request.requestId, request.plan.id)), { status: 200 });
    });
    const gateway = createManagedClaraGateway(
      'https://clara.example.test', identity(), fetcher, { maxPlans: 1 }
    );
    const secondPlan = { ...context, requestId: 'request-2', plan: { ...context.plan, id: 'plan-2' } };
    await gateway.recommend(context, new AbortController().signal);
    await gateway.recommend(secondPlan, new AbortController().signal);
    await gateway.recommend({ ...context, requestId: 'request-3' }, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('never caches malformed responses', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ invalid: true }), { status: 200 }));
    const gateway = createManagedClaraGateway('https://clara.example.test', identity(), fetcher);
    await gateway.recommend(context, new AbortController().signal);
    await gateway.recommend({ ...context, requestId: 'request-2' }, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([401, 503])('rejects non-success status %s', async status => {
    const gateway = createManagedClaraGateway(
      'https://clara.example.test', identity(),
      vi.fn(async () => new Response(null, { status }))
    );
    await expect(gateway.recommend(context, new AbortController().signal)).rejects.toThrow(String(status));
  });

  it('identifies a managed API timeout', async () => {
    const gateway = createManagedClaraGateway(
      'https://clara.example.test', identity(),
      vi.fn(async () => new Response(null, { status: 504 }))
    );
    await expect(gateway.recommend(context, new AbortController().signal))
      .rejects.toBeInstanceOf(ClaraGatewayTimeoutError);
  });

  it('passes cancellation to fetch', async () => {
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
    }));
    const gateway = createManagedClaraGateway('https://clara.example.test', identity(), fetcher);
    const controller = new AbortController();
    const pending = gateway.recommend(context, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
