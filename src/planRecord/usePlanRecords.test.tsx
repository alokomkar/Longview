import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import { usePlanRecords } from './usePlanRecords';
import type { PlanRecord, PlanRecordBundle, PlanRecordDraft, PlanRecordGateway } from './types';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const draft: PlanRecordDraft = {
  kind: 'decision', summary: 'Ship the narrow release first.',
  rationale: 'It creates a trustworthy feedback loop.', confidence: null,
  sourceFacts: [], sourceRecommendationId: null
};
const record: PlanRecord = {
  ...draft, recordId: 'decision-123', planId: 'plan-123', ownerUid: 'owner', workspaceId: 'default',
  requestFingerprint: JSON.stringify([1, draft.kind, draft.summary, draft.rationale, null, [], null]),
  schemaVersion: 1, recordedAt: '2026-08-19T08:00:00.000Z'
};
const empty: PlanRecordBundle = { records: [], history: [] };

describe('usePlanRecords', () => {
  it('loads, saves, and authoritatively reloads the Plan record', async () => {
    const load = vi.fn().mockResolvedValueOnce(empty).mockResolvedValueOnce({ records: [record], history: [] });
    const create = vi.fn(async () => ({ record, duplicate: false }));
    const gateway: PlanRecordGateway = { load, create };
    const { result } = renderHook(() => usePlanRecords(user, 'plan-123', gateway, true));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(async () => { await result.current.create('decision-123', draft); });
    expect(create).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.snapshot.bundle?.records).toEqual([record]);
  });

  it('retains the last confirmed bundle when refresh fails and retries', async () => {
    const load = vi.fn().mockResolvedValueOnce({ records: [record], history: [] }).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(empty);
    const gateway: PlanRecordGateway = { load, create: vi.fn() };
    const { result, rerender } = renderHook(({ enabled }) => usePlanRecords(user, 'plan-123', gateway, enabled), { initialProps: { enabled: true } });
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.snapshot.status).toBe('error'));
    expect(result.current.snapshot.bundle?.records).toEqual([record]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
  });

  it('never exposes a response from a previously selected Plan', async () => {
    const resolvers = new Map<string, (value: typeof empty) => void>();
    const load = vi.fn((_user: AuthUser, planId: string) => new Promise<typeof empty>(next => { resolvers.set(planId, next); }));
    const gateway: PlanRecordGateway = { load, create: vi.fn() };
    const { result, rerender } = renderHook(({ planId }) => usePlanRecords(user, planId, gateway, true), { initialProps: { planId: 'plan-one' } });
    rerender({ planId: 'plan-two' });
    await act(async () => resolvers.get('plan-one')?.({ records: [record], history: [] }));
    expect(result.current.snapshot.status).not.toBe('ready');
  });
});
