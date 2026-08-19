import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import { AchievementConflictError, AchievementIdempotencyConflictError, emptyAchievementDraft, type FinishAchievementRequest } from './types';

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(), getDocs: vi.fn(), runTransaction: vi.fn(), transactionGet: vi.fn(),
  transactionSet: vi.fn(), transactionUpdate: vi.fn(), timestamp: { toDate: () => new Date('2026-08-19T08:00:00.000Z') }
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...parts) => ({ id: parts.at(-1), path: parts.join('/') })),
  doc: vi.fn((_db, ...parts) => ({ id: parts.at(-1), path: parts.join('/') })),
  getDoc: firestore.getDoc, getDocs: firestore.getDocs, runTransaction: firestore.runTransaction,
  serverTimestamp: vi.fn(() => firestore.timestamp)
}));
vi.mock('../firebase/firestore', () => ({ db: { kind: 'test-db' } }));

import { firebaseAchievementGateway } from './firebaseGateway';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const snapshot = (id: string, value?: Record<string, unknown>) => ({ id, exists: () => Boolean(value), data: () => value });
const activePlan = {
  id: 'plan-123', clientRequestId: 'plan-123', ownerUid: 'owner', workspaceId: 'default', title: 'Release Longview',
  outcome: 'Release a tested planning workflow.', why: 'Real users need a useful outcome.', targetDate: '2026-09-30',
  weeklyHours: 6, workingDays: ['wed'], status: 'active', schemaVersion: 2, scheduleVersion: 1,
  createdAt: firestore.timestamp, updatedAt: firestore.timestamp
};
const completion = {
  id: 'completion-123', ownerUid: 'owner', workspaceId: 'default', planId: 'plan-123', stepKey: 'first-proof-v1',
  completedDate: '2026-08-19', durationMinutes: 60, status: 'completed', schemaVersion: 1, completedAt: firestore.timestamp
};
const request = (): FinishAchievementRequest => ({
  achievementId: 'achievement-123', reflectionId: 'reflection-123', consentId: 'consent-123',
  expectedPlanRevision: 1, completedStepIds: ['completion-123'],
  draft: { ...emptyAchievementDraft(), outcome: 'Released one tested planning workflow.', evidence: [{ label: 'Production acceptance', url: null }] }
});

describe('firebaseAchievementGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.runTransaction.mockImplementation(async (_db, update) => update({
      get: firestore.transactionGet, set: firestore.transactionSet, update: firestore.transactionUpdate
    }));
  });

  it('writes achievement, consent, state, and Plan completion in one transaction', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-123', activePlan))
      .mockResolvedValueOnce(snapshot('current')).mockResolvedValueOnce(snapshot('achievement-123'))
      .mockResolvedValueOnce(snapshot('reflection-123')).mockResolvedValueOnce(snapshot('consent-123'))
      .mockResolvedValueOnce(snapshot('completion-123', completion));
    const finished = { ...activePlan, status: 'completed', schemaVersion: 3, achievementId: 'achievement-123', completedAt: firestore.timestamp, completionVersion: 1 };
    const achievement = { schemaVersion: 1, achievementId: 'achievement-123', planId: 'plan-123', ownerUid: 'owner', workspaceId: 'default', outcome: request().draft.outcome, evidence: request().draft.evidence, completedStepIds: ['completion-123'], expectedPlanRevision: 1, reflectionId: null, requestFingerprint: expect.any(String), recordedAt: firestore.timestamp };
    const state = { schemaVersion: 1, planId: 'plan-123', ownerUid: 'owner', workspaceId: 'default', currentAchievementId: 'achievement-123', currentConsentId: 'consent-123', consentVersion: 1, updatedAt: firestore.timestamp };
    const consent = { schemaVersion: 1, consentId: 'consent-123', achievementId: 'achievement-123', reflectionId: null, planId: 'plan-123', ownerUid: 'owner', workspaceId: 'default', purpose: 'future_plan_guidance', approvedReflectionFields: [], version: 1, previousConsentId: null, requestFingerprint: expect.any(String), recordedAt: firestore.timestamp };
    const storedAchievement = { ...achievement, requestFingerprint: JSON.stringify([1, 1, ['completion-123'], request().draft]) };
    const storedConsent = { ...consent, requestFingerprint: JSON.stringify([1, 'achievement-123', null, [], 1, null]) };
    firestore.getDocs.mockResolvedValue({ docs: [snapshot('completion-123', completion)] });
    firestore.getDoc.mockResolvedValueOnce(snapshot('plan-123', finished)).mockResolvedValueOnce(snapshot('current', state))
      .mockResolvedValueOnce(snapshot('plan-123', finished)).mockResolvedValueOnce(snapshot('achievement-123', storedAchievement))
      .mockResolvedValueOnce(snapshot('consent-123', storedConsent));
    await expect(firebaseAchievementGateway.finish(user, 'plan-123', request())).resolves.toMatchObject({ duplicate: false, plan: { status: 'completed' } });
    expect(firestore.transactionSet).toHaveBeenCalledTimes(3);
    expect(firestore.transactionUpdate).toHaveBeenCalledOnce();
  });

  it('rejects stale Plans and changed idempotency payloads before writing', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-123', { ...activePlan, scheduleVersion: 2 }))
      .mockResolvedValueOnce(snapshot('current')).mockResolvedValueOnce(snapshot('achievement-123'))
      .mockResolvedValueOnce(snapshot('reflection-123')).mockResolvedValueOnce(snapshot('consent-123'))
      .mockResolvedValueOnce(snapshot('completion-123', completion));
    await expect(firebaseAchievementGateway.finish(user, 'plan-123', request())).rejects.toBeInstanceOf(AchievementConflictError);
    expect(firestore.transactionSet).not.toHaveBeenCalled();

    firestore.transactionGet.mockReset().mockResolvedValueOnce(snapshot('plan-123', {
      ...activePlan, status: 'completed', schemaVersion: 3, achievementId: 'achievement-123',
      completedAt: firestore.timestamp, completionVersion: 1
    }))
      .mockResolvedValueOnce(snapshot('current', { schemaVersion: 1, planId: 'plan-123', ownerUid: 'owner', workspaceId: 'default', currentAchievementId: 'achievement-123', currentConsentId: 'consent-123', consentVersion: 1 }))
      .mockResolvedValueOnce(snapshot('achievement-123', { requestFingerprint: 'different' }))
      .mockResolvedValueOnce(snapshot('reflection-123')).mockResolvedValueOnce(snapshot('consent-123'))
      .mockResolvedValueOnce(snapshot('completion-123', completion));
    await expect(firebaseAchievementGateway.finish(user, 'plan-123', request())).rejects.toBeInstanceOf(AchievementIdempotencyConflictError);
  });
});
