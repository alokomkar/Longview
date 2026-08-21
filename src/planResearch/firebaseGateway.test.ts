import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import { PlanResearchConflictError, sourceCreateFingerprint, sourceIdForUrl, sourceStateFingerprint, wikiFingerprint, type PlanResearchSourceDraft, type ResearchSourceStateDraft } from './types';

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(), getDocs: vi.fn(), runTransaction: vi.fn(), transactionGet: vi.fn(), transactionSet: vi.fn(),
  timestamp: { toDate: () => new Date('2026-08-21T08:00:00.000Z') }
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...parts) => ({ id: parts.at(-1), path: parts.join('/') })),
  doc: vi.fn((_db, ...parts) => ({ id: parts.at(-1), path: parts.join('/') })),
  getDoc: firestore.getDoc, getDocs: firestore.getDocs, runTransaction: firestore.runTransaction,
  serverTimestamp: vi.fn(() => firestore.timestamp)
}));
vi.mock('../firebase/firestore', () => ({ db: { kind: 'test-db' } }));

import { firebasePlanResearchSourceGateway } from './firebaseGateway';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const draft: PlanResearchSourceDraft = { url: 'https://example.com/useful', title: 'Useful source', excerpt: 'A useful excerpt for this Plan.', note: 'Use this when planning the first milestone.', topic: 'First milestone' };
const state: ResearchSourceStateDraft = { note: draft.note, topic: draft.topic, workflowState: 'inbox', planIds: ['plan-1'] };
const snapshot = (id: string, value?: Record<string, unknown>) => ({ id, exists: () => Boolean(value), data: () => value });

const storedValues = async (overrides: Partial<ResearchSourceStateDraft> = {}) => {
  const sourceId = await sourceIdForUrl(draft.url);
  const source = { schemaVersion: 1, sourceId, ownerUid: 'owner', workspaceId: 'default', url: draft.url, normalizedUrl: draft.url,
    domain: 'example.com', title: draft.title, excerpt: draft.excerpt, capturedBy: 'user', capturedAt: firestore.timestamp };
  const storedState = { schemaVersion: 1, sourceId, ownerUid: 'owner', workspaceId: 'default', ...state, ...overrides,
    revision: 1, latestEventId: 'request-123', updatedAt: firestore.timestamp };
  return { sourceId, source, storedState };
};

describe('firebasePlanResearchSourceGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.runTransaction.mockImplementation(async (_db, update) => update({ get: firestore.transactionGet, set: firestore.transactionSet }));
  });

  it('atomically creates a canonical source, organization state, and immutable event', async () => {
    const { sourceId, source, storedState } = await storedValues();
    firestore.transactionGet.mockResolvedValueOnce(snapshot(sourceId)).mockResolvedValueOnce(snapshot(sourceId)).mockResolvedValueOnce(snapshot('request-123')).mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' }));
    firestore.getDoc.mockResolvedValueOnce(snapshot(sourceId, source)).mockResolvedValueOnce(snapshot(sourceId, storedState));
    await expect(firebasePlanResearchSourceGateway.save(user, 'request-123', draft, state)).resolves.toMatchObject({ duplicate: false, value: { source: { sourceId }, state: { planIds: ['plan-1'] } } });
    expect(firestore.transactionSet).toHaveBeenCalledTimes(3);
    expect(sourceCreateFingerprint(draft, draft.url, state)).toContain('plan-1');
  });

  it('applies one reviewed organization revision and rejects stale writers', async () => {
    const { sourceId, source, storedState } = await storedValues();
    const next = { ...state, workflowState: 'useful' as const, planIds: ['plan-1', 'plan-2'] };
    firestore.transactionGet.mockResolvedValueOnce(snapshot(sourceId, source)).mockResolvedValueOnce(snapshot(sourceId, storedState)).mockResolvedValueOnce(snapshot('event-456')).mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' })).mockResolvedValueOnce(snapshot('plan-2', { ownerUid: 'owner' }));
    firestore.getDoc.mockResolvedValueOnce(snapshot(sourceId, source)).mockResolvedValueOnce(snapshot(sourceId, { ...storedState, ...next, revision: 2, latestEventId: 'event-456' }));
    await expect(firebasePlanResearchSourceGateway.update(user, sourceId, 'event-456', 1, next)).resolves.toMatchObject({ value: { state: { workflowState: 'useful', revision: 2 } } });
    expect(sourceStateFingerprint(next)).toContain('useful');

    firestore.transactionGet.mockReset().mockResolvedValueOnce(snapshot(sourceId, source)).mockResolvedValueOnce(snapshot(sourceId, { ...storedState, revision: 3 })).mockResolvedValueOnce(snapshot('event-789')).mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' })).mockResolvedValueOnce(snapshot('plan-2', { ownerUid: 'owner' }));
    await expect(firebasePlanResearchSourceGateway.update(user, sourceId, 'event-789', 1, next)).rejects.toBeInstanceOf(PlanResearchConflictError);
  });

  it('restores legacy Plan links in the workspace library without rewriting them', async () => {
    const { sourceId, source } = await storedValues();
    const legacy = { note: draft.note, topic: draft.topic, createdAt: firestore.timestamp };
    firestore.getDocs.mockResolvedValueOnce({ docs: [{ id: sourceId, data: () => source }] }).mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [{ id: sourceId, data: () => legacy }] });
    await expect(firebasePlanResearchSourceGateway.list(user, ['plan-1'])).resolves.toMatchObject([{ state: { revision: 0, planIds: ['plan-1'], workflowState: 'inbox' } }]);
  });

  it('saves an immutable cited Wiki revision only from useful linked sources', async () => {
    const { sourceId, storedState } = await storedValues({ workflowState: 'useful' });
    const wiki = { pageId: 'wiki-page-1', title: 'First value', body: 'A sufficiently detailed synthesis for the current Plan.', citations: [{ sourceId, statement: 'A useful visible result should happen before expansion.' }] };
    const version = { ...wiki, schemaVersion: 1, versionId: 'wiki-version-1', version: 1, planId: 'plan-1', ownerUid: 'owner', workspaceId: 'default', requestFingerprint: wikiFingerprint(wiki), recordedAt: firestore.timestamp };
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' })).mockResolvedValueOnce(snapshot('wiki-page-1')).mockResolvedValueOnce(snapshot('wiki-version-1')).mockResolvedValueOnce(snapshot(sourceId, storedState));
    firestore.getDoc.mockResolvedValueOnce(snapshot('wiki-version-1', version));
    await expect(firebasePlanResearchSourceGateway.saveWiki(user, 'plan-1', 'wiki-version-1', 0, wiki)).resolves.toMatchObject({ value: { version: 1 } });
    expect(firestore.transactionSet).toHaveBeenCalledTimes(2);
  });
});
