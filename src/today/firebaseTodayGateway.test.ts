import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import type { TodayStep } from './deriveTodayStep';

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  runTransaction: vi.fn(),
  transactionGet: vi.fn(),
  transactionSet: vi.fn(),
  reference: { id: '2026-08-17_plan-1_first-proof-v1' },
  timestamp: { kind: 'server-timestamp' }
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => firestore.reference),
  getDoc: firestore.getDoc,
  runTransaction: firestore.runTransaction,
  serverTimestamp: vi.fn(() => firestore.timestamp)
}));
vi.mock('../firebase/firestore', () => ({ db: { kind: 'test-db' } }));

import { firebaseTodayGateway } from './firebaseTodayGateway';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const step: TodayStep = {
  completionId: firestore.reference.id, date: '2026-08-17', planId: 'plan-1',
  planTitle: 'Plan one', title: 'First proof', description: 'Describe proof.',
  durationMinutes: 60, targetDate: '2026-09-30'
};
const stored = {
  id: step.completionId, ownerUid: user.uid, workspaceId: 'default', planId: step.planId,
  stepKey: 'first-proof-v1', completedDate: step.date, durationMinutes: step.durationMinutes,
  status: 'completed', schemaVersion: 1
};

describe('firebaseTodayGateway.complete', () => {
  beforeEach(() => {
    firestore.transactionGet.mockReset();
    firestore.transactionSet.mockReset();
    firestore.runTransaction.mockImplementation(async (_db, update) => update({
      get: firestore.transactionGet,
      set: firestore.transactionSet
    }));
  });

  it('creates the deterministic completion once', async () => {
    firestore.transactionGet.mockResolvedValue({ exists: () => false });
    await expect(firebaseTodayGateway.complete(user, step)).resolves.toEqual({
      completion: stored, duplicate: false
    });
    expect(firestore.transactionSet).toHaveBeenCalledWith(
      firestore.reference,
      { ...stored, completedAt: firestore.timestamp }
    );
  });

  it('returns the original valid completion without another write', async () => {
    firestore.transactionGet.mockResolvedValue({
      exists: () => true, id: step.completionId, data: () => stored
    });
    await expect(firebaseTodayGateway.complete(user, step)).resolves.toEqual({
      completion: stored, duplicate: true
    });
    expect(firestore.transactionSet).not.toHaveBeenCalled();
  });

  it.each([
    { ...stored, ownerUid: 'another-owner' },
    { ...stored, durationMinutes: 30 },
    { ...stored, completedDate: 'not-a-date' }
  ])('fails closed for invalid stored proof %#', async invalid => {
    firestore.transactionGet.mockResolvedValue({
      exists: () => true, id: step.completionId, data: () => invalid
    });
    await expect(firebaseTodayGateway.complete(user, step)).rejects.toThrow('Stored completion failed validation.');
    expect(firestore.transactionSet).not.toHaveBeenCalled();
  });
});
