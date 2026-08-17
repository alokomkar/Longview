import { describe, expect, it, vi } from 'vitest';
import type { ClaraContext } from './types';
import { createManagedClaraGateway } from './managedGateway';

const context: ClaraContext = {
  schemaVersion: 1, requestId: 'request-1', scope: 'today-step',
  plan: { id: 'plan-1', title: 'Launch Longview', outcome: 'Release a tested PWA.', targetDate: '2026-08-20', weeklyHours: 4 },
  step: { title: 'Define proof', description: 'Write one result.', durationMinutes: 60, date: '2026-08-17' }
};

describe('managed Clara gateway', () => {
  it('sends the Firebase token and exact bounded context', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const gateway = createManagedClaraGateway('https://clara.example.test/', async () => 'id-token', fetcher);
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

  it.each([401, 503, 504])('rejects non-success status %s', async status => {
    const gateway = createManagedClaraGateway(
      'https://clara.example.test', async () => 'token',
      vi.fn(async () => new Response(null, { status }))
    );
    await expect(gateway.recommend(context, new AbortController().signal)).rejects.toThrow(String(status));
  });

  it('passes cancellation to fetch', async () => {
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
    }));
    const gateway = createManagedClaraGateway('https://clara.example.test', async () => 'token', fetcher);
    const controller = new AbortController();
    const pending = gateway.recommend(context, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
