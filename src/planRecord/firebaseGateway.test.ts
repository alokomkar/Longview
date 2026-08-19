import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import { planRecordFingerprint, PlanRecordConflictError, type PlanRecordDraft } from './types';

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(), getDocs: vi.fn(), runTransaction: vi.fn(), transactionGet: vi.fn(), transactionSet: vi.fn(),
  timestamp: { toDate: () => new Date('2026-08-19T08:00:00.000Z') }
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...parts) => ({ id: parts.at(-1), path: parts.join('/') })),
  doc: vi.fn((_db, ...parts) => ({ id: parts.at(-1), path: parts.join('/') })),
  getDoc: firestore.getDoc,
  getDocs: firestore.getDocs,
  query: vi.fn(reference => reference),
  runTransaction: firestore.runTransaction,
  serverTimestamp: vi.fn(() => firestore.timestamp),
  where: vi.fn((...args) => args)
}));
vi.mock('../firebase/firestore', () => ({ db: { kind: 'test-db' } }));

import { firebasePlanRecordGateway } from './firebaseGateway';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const draft: PlanRecordDraft = {
  kind: 'decision', summary: 'Ship the narrow release first.',
  rationale: 'It creates a trustworthy feedback loop.', confidence: null,
  sourceFacts: [], sourceRecommendationId: null
};
const stored = {
  ...draft, recordId: 'decision-123', planId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
  requestFingerprint: planRecordFingerprint(draft), schemaVersion: 1, recordedAt: firestore.timestamp
};
const snapshot = (id: string, value?: Record<string, unknown>) => ({
  id, exists: () => Boolean(value), data: () => value
});

describe('firebasePlanRecordGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.runTransaction.mockImplementation(async (_db, update) => update({
      get: firestore.transactionGet, set: firestore.transactionSet
    }));
    firestore.getDoc.mockResolvedValue(snapshot('decision-123', stored));
  });

  it('creates one append-only record after checking the current Plan', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' })).mockResolvedValueOnce(snapshot('decision-123'));
    await expect(firebasePlanRecordGateway.create(user, 'plan-1', 'decision-123', draft)).resolves.toMatchObject({ duplicate: false, record: { recordId: 'decision-123' } });
    expect(firestore.transactionSet).toHaveBeenCalledOnce();
    expect(firestore.transactionSet.mock.calls[0][1]).toMatchObject({ requestFingerprint: planRecordFingerprint(draft), recordedAt: firestore.timestamp });
  });

  it('restores the original record on duplicate or lost-response retry without writing again', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' })).mockResolvedValueOnce(snapshot('decision-123', stored));
    await expect(firebasePlanRecordGateway.create(user, 'plan-1', 'decision-123', draft)).resolves.toMatchObject({ duplicate: true });
    expect(firestore.transactionSet).not.toHaveBeenCalled();
  });

  it('fails closed when the same key has different content', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' })).mockResolvedValueOnce(snapshot('decision-123', { ...stored, requestFingerprint: 'different' }));
    await expect(firebasePlanRecordGateway.create(user, 'plan-1', 'decision-123', draft)).rejects.toBeInstanceOf(PlanRecordConflictError);
    expect(firestore.transactionSet).not.toHaveBeenCalled();
  });

  it.each([
    ['missing Plan', snapshot('plan-1')],
    ['wrong owner', snapshot('plan-1', { ownerUid: 'other' })]
  ])('does not create for a %s', async (_label, plan) => {
    firestore.transactionGet.mockResolvedValueOnce(plan);
    await expect(firebasePlanRecordGateway.create(user, 'plan-1', 'decision-123', draft)).rejects.toThrow('Plan not found.');
    expect(firestore.transactionSet).not.toHaveBeenCalled();
  });

  it('loads and orders validated records, completions, and approved changes', async () => {
    const recordDoc = { id: 'decision-123', data: () => stored };
    const completion = { id: 'completion-1', data: () => ({ ownerUid: 'owner', workspaceId: 'default', planId: 'plan-1', status: 'completed', durationMinutes: 60, completedDate: '2026-08-18', completedAt: { toDate: () => new Date('2026-08-18T08:00:00Z') } }) };
    const approval = { id: 'approval-1', data: () => ({ ownerUid: 'owner', workspaceId: 'default', planId: 'plan-1', kind: 'plan-working-days', before: { workingDays: ['mon'] }, after: { workingDays: ['mon', 'wed'] }, createdAt: { toDate: () => new Date('2026-08-19T09:00:00Z') } }) };
    firestore.getDocs.mockResolvedValueOnce({ docs: [recordDoc] }).mockResolvedValueOnce({ docs: [completion] }).mockResolvedValueOnce({ docs: [approval] });
    const result = await firebasePlanRecordGateway.load(user, 'plan-1');
    expect(result.records[0].recordId).toBe('decision-123');
    expect(result.history.map(entry => entry.sourceId)).toEqual(['approval-1', 'completion-1']);
  });

  it('rejects malformed stored record or history instead of showing stale ownership', async () => {
    firestore.getDocs.mockResolvedValueOnce({ docs: [{ id: 'decision-123', data: () => ({ ...stored, ownerUid: 'other' }) }] }).mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [] });
    await expect(firebasePlanRecordGateway.load(user, 'plan-1')).rejects.toThrow('Stored Plan record failed validation.');
  });
});
