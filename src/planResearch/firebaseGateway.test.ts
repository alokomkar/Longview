import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import { DuplicateResearchSourceError, planSourceLinkFingerprint, sourceIdForUrl, type PlanResearchSourceDraft } from './types';

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
const draft: PlanResearchSourceDraft = {
  url: 'https://example.com/useful', title: 'Useful source', excerpt: 'A useful excerpt for this Plan.',
  note: 'Use this when planning the first milestone.', topic: 'First milestone'
};
const snapshot = (id: string, value?: Record<string, unknown>) => ({ id, exists: () => Boolean(value), data: () => value });

describe('firebasePlanResearchSourceGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.runTransaction.mockImplementation(async (_db, update) => update({ get: firestore.transactionGet, set: firestore.transactionSet }));
  });

  it('atomically creates one canonical source and one Plan link', async () => {
    const sourceId = await sourceIdForUrl(draft.url);
    const storedSource = { schemaVersion: 1, sourceId, ownerUid: 'owner', workspaceId: 'default', url: draft.url,
      normalizedUrl: draft.url, domain: 'example.com', title: draft.title, excerpt: draft.excerpt,
      capturedBy: 'user', capturedAt: firestore.timestamp };
    const storedLink = { schemaVersion: 1, sourceId, planId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
      note: draft.note, topic: draft.topic, state: 'inbox', requestId: 'request-123',
      requestFingerprint: planSourceLinkFingerprint(draft, draft.url), createdAt: firestore.timestamp };
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' })).mockResolvedValueOnce(snapshot(sourceId)).mockResolvedValueOnce(snapshot(sourceId));
    firestore.getDoc.mockResolvedValueOnce(snapshot(sourceId, storedSource)).mockResolvedValueOnce(snapshot(sourceId, storedLink));

    await expect(firebasePlanResearchSourceGateway.save(user, 'plan-1', 'request-123', draft)).resolves.toMatchObject({ duplicate: false, value: { source: { sourceId } } });
    expect(firestore.transactionSet).toHaveBeenCalledTimes(2);
  });

  it('restores an exact retry without creating duplicate writes', async () => {
    const sourceId = await sourceIdForUrl(draft.url);
    const source = { schemaVersion: 1, sourceId, ownerUid: 'owner', workspaceId: 'default', url: draft.url, normalizedUrl: draft.url,
      domain: 'example.com', title: draft.title, excerpt: draft.excerpt, capturedBy: 'user', capturedAt: firestore.timestamp };
    const link = { schemaVersion: 1, sourceId, planId: 'plan-1', ownerUid: 'owner', workspaceId: 'default', note: draft.note,
      topic: draft.topic, state: 'inbox', requestId: 'request-123', requestFingerprint: planSourceLinkFingerprint(draft, draft.url), createdAt: firestore.timestamp };
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' })).mockResolvedValueOnce(snapshot(sourceId, source)).mockResolvedValueOnce(snapshot(sourceId, link));
    firestore.getDoc.mockResolvedValueOnce(snapshot(sourceId, source)).mockResolvedValueOnce(snapshot(sourceId, link));
    await expect(firebasePlanResearchSourceGateway.save(user, 'plan-1', 'request-123', draft)).resolves.toMatchObject({ duplicate: true });
    expect(firestore.transactionSet).not.toHaveBeenCalled();
  });

  it('rejects a changed duplicate URL without overwriting the existing source', async () => {
    const sourceId = await sourceIdForUrl(draft.url);
    const existing = { schemaVersion: 1, sourceId, planId: 'plan-1', ownerUid: 'owner', workspaceId: 'default', note: 'Different note',
      topic: draft.topic, state: 'inbox', requestId: 'old-request', requestFingerprint: 'different', createdAt: firestore.timestamp };
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'owner' })).mockResolvedValueOnce(snapshot(sourceId)).mockResolvedValueOnce(snapshot(sourceId, existing));
    await expect(firebasePlanResearchSourceGateway.save(user, 'plan-1', 'request-456', draft)).rejects.toBeInstanceOf(DuplicateResearchSourceError);
    expect(firestore.transactionSet).not.toHaveBeenCalled();
  });

  it('fails closed for a missing or cross-owner Plan', async () => {
    firestore.transactionGet.mockResolvedValueOnce(snapshot('plan-1', { ownerUid: 'other' }));
    await expect(firebasePlanResearchSourceGateway.save(user, 'plan-1', 'request-123', draft)).rejects.toThrow('Plan not found.');
    expect(firestore.transactionSet).not.toHaveBeenCalled();
  });

  it('loads only validated source and Plan-link pairs', async () => {
    const sourceId = 'a'.repeat(64);
    const source = { schemaVersion: 1, sourceId, ownerUid: 'owner', workspaceId: 'default', url: draft.url, normalizedUrl: draft.url,
      domain: 'example.com', title: draft.title, excerpt: draft.excerpt, capturedBy: 'user', capturedAt: firestore.timestamp };
    const link = { schemaVersion: 1, sourceId, planId: 'plan-1', ownerUid: 'owner', workspaceId: 'default', note: draft.note,
      topic: draft.topic, state: 'inbox', requestId: 'request-123', requestFingerprint: planSourceLinkFingerprint(draft, draft.url), createdAt: firestore.timestamp };
    firestore.getDocs.mockResolvedValueOnce({ docs: [{ id: sourceId, data: () => link }] });
    firestore.getDoc.mockResolvedValueOnce(snapshot(sourceId, source));
    await expect(firebasePlanResearchSourceGateway.list(user, 'plan-1')).resolves.toMatchObject([{ source: { sourceId }, link: { planId: 'plan-1' } }]);

    firestore.getDocs.mockResolvedValueOnce({ docs: [{ id: sourceId, data: () => link }] });
    firestore.getDoc.mockResolvedValueOnce(snapshot(sourceId, { ...source, ownerUid: 'other' }));
    await expect(firebasePlanResearchSourceGateway.list(user, 'plan-1')).rejects.toThrow('Stored research source failed validation.');
  });
});
