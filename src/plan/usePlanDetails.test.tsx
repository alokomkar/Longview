import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlanDetails } from './usePlanDetails';
import type { Plan, PlanGateway } from './types';

const user = { uid: 'owner', isAnonymous: false, displayName: 'Owner' };
const plan = (id: string): Plan => ({
  id, clientRequestId: id, ownerUid: user.uid, workspaceId: 'default', title: `Plan ${id}`,
  outcome: 'Reach one observable and useful outcome.', why: 'Keep meaningful progress visible.',
  targetDate: '2026-09-01', weeklyHours: 4, workingDays: ['mon'], status: 'active',
  schemaVersion: 2, scheduleVersion: 1
});

describe('usePlanDetails', () => {
  it('ignores a late read after the selected Plan changes', async () => {
    const pending = new Map<string, (value: Plan) => void>();
    const gateway: PlanGateway = {
      create: vi.fn(), list: vi.fn(), updateSchedule: vi.fn(),
      get: vi.fn((_user, id) => new Promise<Plan>(resolve => pending.set(id, resolve)))
    };
    const { result, rerender } = renderHook(
      ({ id }) => usePlanDetails(user, gateway, id, true),
      { initialProps: { id: 'one' } }
    );
    await waitFor(() => expect(pending.has('one')).toBe(true));
    rerender({ id: 'two' });
    await waitFor(() => expect(pending.has('two')).toBe(true));
    await act(async () => pending.get('one')?.(plan('one')));
    expect(result.current.snapshot.status).toBe('loading');
    await act(async () => pending.get('two')?.(plan('two')));
    await waitFor(() => expect(result.current.snapshot).toMatchObject({ status: 'ready', plan: { id: 'two' } }));
  });
});
