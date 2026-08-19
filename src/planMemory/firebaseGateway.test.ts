import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import {
  PlanBriefConflictError,
  PlanMemoryIdempotencyConflictError,
  ResearchConflictError,
  planBriefFingerprint,
  researchCardFingerprint,
  researchReviewFingerprint,
  type PlanBriefDraft,
  type ResearchCandidate
} from './types';

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(), getDocs: vi.fn(), runTransaction: vi.fn(), transactionGet: vi.fn(), transactionSet: vi.fn(),
  timestamp: { toDate: () => new Date('2026-08-19T08:00:00.000Z') }
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...parts) => ({ id: parts.at(-1), path: parts.join('/') })),
  doc: vi.fn((_db, ...parts) => ({ id: parts.at(-1), path: parts.join('/') })),
  getDoc: firestore.getDoc, getDocs: firestore.getDocs, runTransaction: firestore.runTransaction,
  serverTimestamp: vi.fn(() => firestore.timestamp)
}));
vi.mock('../firebase/firestore', () => ({ db: { kind: 'test-db' } }));

import { firebasePlanMemoryGateway } from './firebaseGateway';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const candidate: ResearchCandidate = {
  schemaVersion: 1, researchId: 'research-123', requestId: 'request-123', sourcePlanId: 'plan-1',
  headline: 'Visible first value improves activation',
  finding: 'Users continue setup after seeing one meaningful outcome.',
  source: { kind: 'web', title: 'Activation research', locator: 'https://example.com/research', domain: 'example.com', publishedAt: null, retrievedAt: '2026-08-19T08:00:00.000Z' }
};
const draft: PlanBriefDraft = {
  focus: 'Prove first value', approach: 'Use one reviewed finding in a bounded user test.',
  successEvidence: 'Three users reach the visible checkpoint.', sourceResearchIds: ['research-123']
};
const snapshot = (id: string, value?: Record<string, unknown>) => ({ id, exists: () => Boolean(value), data: () => value });
const cardStored = {
  ...candidate, planId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
  cardFingerprint: researchCardFingerprint(candidate), createdAt: firestore.timestamp
};
const reviewStored = {
  schemaVersion: 1, reviewId: 'review-1234', researchId: 'research-123', planId: 'plan-1',
  ownerUid: 'owner', workspaceId: 'default', decision: 'accepted', revision: 1,
  requestFingerprint: researchReviewFingerprint(candidate, 'accepted'), reviewedAt: firestore.timestamp
};
const stateStored = {
  schemaVersion: 1, researchId: 'research-123', planId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
  currentDecision: 'accepted', revision: 1, latestReviewId: 'review-1234', reviewedAt: firestore.timestamp
};

describe('firebasePlanMemoryGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.runTransaction.mockImplementation(async (_db, update) => update({ get: firestore.transactionGet, set: firestore.transactionSet }));
  });

  it('creates one card, review, and state atomically, then restores the authoritative result', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' }))
      .mockResolvedValueOnce(snapshot('review-1234')).mockResolvedValueOnce(snapshot('research-123'))
      .mockResolvedValueOnce(snapshot('research-123'));
    firestore.getDoc.mockResolvedValueOnce(snapshot('research-123', cardStored))
      .mockResolvedValueOnce(snapshot('research-123', stateStored)).mockResolvedValueOnce(snapshot('review-1234', reviewStored));
    await expect(firebasePlanMemoryGateway.reviewResearch(user, 'plan-1', 'review-1234', candidate, 'accepted', 0))
      .resolves.toMatchObject({ duplicate: false, research: { decision: 'accepted', revision: 1 } });
    expect(firestore.transactionSet).toHaveBeenCalledTimes(3);
  });

  it('restores duplicate research reviews and rejects changed idempotency payloads', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' }))
      .mockResolvedValueOnce(snapshot('review-1234', reviewStored)).mockResolvedValueOnce(snapshot('research-123', cardStored))
      .mockResolvedValueOnce(snapshot('research-123', stateStored));
    firestore.getDoc.mockResolvedValueOnce(snapshot('research-123', cardStored))
      .mockResolvedValueOnce(snapshot('research-123', stateStored)).mockResolvedValueOnce(snapshot('review-1234', reviewStored));
    await expect(firebasePlanMemoryGateway.reviewResearch(user, 'plan-1', 'review-1234', candidate, 'accepted', 0))
      .resolves.toMatchObject({ duplicate: true });
    expect(firestore.transactionSet).not.toHaveBeenCalled();

    firestore.transactionGet.mockReset().mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' }))
      .mockResolvedValueOnce(snapshot('review-1234', { ...reviewStored, requestFingerprint: 'different' }))
      .mockResolvedValueOnce(snapshot('research-123', cardStored)).mockResolvedValueOnce(snapshot('research-123', stateStored));
    await expect(firebasePlanMemoryGateway.reviewResearch(user, 'plan-1', 'review-1234', candidate, 'accepted', 0))
      .rejects.toBeInstanceOf(PlanMemoryIdempotencyConflictError);
  });

  it('rejects a stale research revision before any write', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' }))
      .mockResolvedValueOnce(snapshot('review-5678')).mockResolvedValueOnce(snapshot('research-123', cardStored))
      .mockResolvedValueOnce(snapshot('research-123', stateStored));
    await expect(firebasePlanMemoryGateway.reviewResearch(user, 'plan-1', 'review-5678', candidate, 'rejected', 0))
      .rejects.toBeInstanceOf(ResearchConflictError);
    expect(firestore.transactionSet).not.toHaveBeenCalled();
  });

  it('creates one version and pointer only when every source is currently accepted', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' }))
      .mockResolvedValueOnce(snapshot('version-123')).mockResolvedValueOnce(snapshot('current'))
      .mockResolvedValueOnce(snapshot('research-123', stateStored));
    const briefStored = {
      ...draft, schemaVersion: 1, versionId: 'version-123', version: 1, planId: 'plan-1',
      ownerUid: 'owner', workspaceId: 'default', requestFingerprint: planBriefFingerprint(draft), recordedAt: firestore.timestamp
    };
    firestore.getDoc.mockResolvedValue(snapshot('version-123', briefStored));
    await expect(firebasePlanMemoryGateway.saveBrief(user, 'plan-1', 'version-123', draft, 0))
      .resolves.toMatchObject({ duplicate: false, brief: { version: 1 } });
    expect(firestore.transactionSet).toHaveBeenCalledTimes(2);
  });

  it('rejects stale or no-longer-accepted brief sources without partial writes', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' }))
      .mockResolvedValueOnce(snapshot('version-123')).mockResolvedValueOnce(snapshot('current', { currentVersion: 2 }))
      .mockResolvedValueOnce(snapshot('research-123', stateStored));
    await expect(firebasePlanMemoryGateway.saveBrief(user, 'plan-1', 'version-123', draft, 1))
      .rejects.toBeInstanceOf(PlanBriefConflictError);
    expect(firestore.transactionSet).not.toHaveBeenCalled();

    firestore.transactionGet.mockReset().mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' }))
      .mockResolvedValueOnce(snapshot('version-456')).mockResolvedValueOnce(snapshot('current'))
      .mockResolvedValueOnce(snapshot('research-123', { ...stateStored, currentDecision: 'rejected' }));
    await expect(firebasePlanMemoryGateway.saveBrief(user, 'plan-1', 'version-456', draft, 0))
      .rejects.toBeInstanceOf(PlanBriefConflictError);
  });

  it('loads research and briefs independently and rejects malformed pointers', async () => {
    firestore.getDocs.mockResolvedValueOnce({ docs: [{ id: 'research-123' }] });
    firestore.getDoc.mockResolvedValueOnce(snapshot('research-123', cardStored))
      .mockResolvedValueOnce(snapshot('research-123', stateStored)).mockResolvedValueOnce(snapshot('review-1234', reviewStored));
    await expect(firebasePlanMemoryGateway.loadResearch(user, 'plan-1')).resolves.toHaveLength(1);

    firestore.getDocs.mockResolvedValueOnce({ docs: [] });
    firestore.getDoc.mockResolvedValueOnce(snapshot('current', { planId: 'plan-1', ownerUid: 'owner', workspaceId: 'default', schemaVersion: 1, currentVersion: 1, currentVersionId: 'missing-123' }));
    await expect(firebasePlanMemoryGateway.loadBrief(user, 'plan-1')).rejects.toThrow('Current Plan Brief could not be restored.');
  });
});
