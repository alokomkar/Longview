import { describe, expect, it, vi } from 'vitest';
import { ClaraApprovalConflictError } from './approvalTypes';
import { createManagedClaraApprovalGateway } from './managedApprovalGateway';
import type { ClaraPlanScheduleChange } from './types';

const proposal: ClaraPlanScheduleChange = {
  kind: 'plan-working-days', planId: 'plan-1', expectedScheduleVersion: 2,
  workingDaysBefore: ['mon', 'fri'], workingDaysAfter: ['mon', 'wed', 'fri'], weeklyHours: 4,
  rationale: 'A midweek checkpoint reduces the gap between sessions.',
  downstreamEffect: 'Today can select this Plan on Wednesday without changing weekly time.'
};
const result = {
  schemaVersion: 1, idempotencyKey: 'approval-123', planId: 'plan-1', scheduleVersion: 3,
  workingDays: ['mon', 'wed', 'fri'], weeklyHours: 4, auditEventId: 'approval-123', duplicate: false
};

describe('managed Clara approval gateway', () => {
  it('sends the token, idempotency key, and exact reviewed proposal', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(result), { status: 200 }));
    const gateway = createManagedClaraApprovalGateway('https://clara.example.test/', async () => 'token-1', fetcher);
    await expect(gateway.apply(proposal, 'approval-123')).resolves.toEqual(result);
    expect(fetcher).toHaveBeenCalledWith('https://clara.example.test/v1/clara/approvals', {
      method: 'POST', headers: { Authorization: 'Bearer token-1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, idempotencyKey: 'approval-123', proposal }),
      signal: expect.any(AbortSignal)
    });
  });

  it('bounds a stalled approval and preserves retry at the caller', async () => {
    const fetcher = vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const gateway = createManagedClaraApprovalGateway('', async () => 'token', fetcher, 5);
    await expect(gateway.apply(proposal, 'approval-123')).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('distinguishes stale state and rejects malformed success responses', async () => {
    const conflict = createManagedClaraApprovalGateway('', async () => 'token', vi.fn(async () => new Response(null, { status: 409 })));
    await expect(conflict.apply(proposal, 'approval-123')).rejects.toBeInstanceOf(ClaraApprovalConflictError);
    const malformed = createManagedClaraApprovalGateway('', async () => 'token', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(malformed.apply(proposal, 'approval-123')).rejects.toThrow('validation');
  });
});
