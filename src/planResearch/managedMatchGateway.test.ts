import { describe, expect, it, vi } from 'vitest';
import { createManagedPlanMatchGateway } from './managedMatchGateway';
import { PlanMatchTimeoutError, type PlanMatchRequest } from './matching';

const request: PlanMatchRequest = { schemaVersion: 1, requestId: 'match-123', source: { title: 'Useful source', excerpt: 'A useful source excerpt.', note: 'Use this later.', topic: 'Evidence' }, plans: [{ id: 'plan-1', title: 'Launch Longview', outcome: 'Release a tested product.', why: 'Learn what users value.' }] };
const user = { uid: 'owner', displayName: null, isAnonymous: false };

describe('managed Plan match gateway', () => {
  it('authenticates the bounded request and supports cancellation', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const gateway = createManagedPlanMatchGateway('https://api.example.com/', async () => ({ getToken: async () => 'token' }), fetcher as typeof fetch);
    await expect(gateway.match(user, request, new AbortController().signal)).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith('https://api.example.com/v1/clara/plan-matches', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer token' }) }));
  });

  it('maps API timeout without treating it as a valid suggestion', async () => {
    const gateway = createManagedPlanMatchGateway('https://api.example.com', async () => ({ getToken: async () => 'token' }), vi.fn(async () => new Response('', { status: 504 })) as typeof fetch);
    await expect(gateway.match(user, request, new AbortController().signal)).rejects.toBeInstanceOf(PlanMatchTimeoutError);
  });
});
