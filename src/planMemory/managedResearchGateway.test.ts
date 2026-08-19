import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import { createManagedResearchGateway } from './managedResearchGateway';
import { ResearchGatewayTimeoutError, type ResearchRequest } from './types';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const request: ResearchRequest = {
  schemaVersion: 1, requestId: 'request-123', existingResearchIds: [],
  plan: { id: 'plan-123', title: 'Launch Longview', outcome: 'Release a tested workflow to users.', why: 'Real evidence matters.', targetDate: '2026-09-30' }
};

describe('managed research gateway', () => {
  it('sends an authenticated, abortable request to the bounded endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const gateway = createManagedResearchGateway('https://api.example/', async () => ({ getToken: async () => 'token-1' }), fetcher);
    const controller = new AbortController();
    await expect(gateway.request(user, request, controller.signal)).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith('https://api.example/v1/clara/research', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer token-1' }), signal: controller.signal
    }));
  });

  it('maps server timeouts and honours cancellation before network work', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 504 }));
    const identity = vi.fn(async () => ({ getToken: async () => 'token-1' }));
    const gateway = createManagedResearchGateway('https://api.example', identity, fetcher);
    await expect(gateway.request(user, request, new AbortController().signal)).rejects.toBeInstanceOf(ResearchGatewayTimeoutError);
    const cancelled = new AbortController(); cancelled.abort();
    await expect(gateway.request(user, request, cancelled.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
