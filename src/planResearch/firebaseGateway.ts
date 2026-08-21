import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firestore';
import {
  DuplicateResearchSourceError,
  PlanResearchIdempotencyConflictError,
  normalizeResearchUrl,
  parsePlanSourceLink,
  parseStoredResearchSource,
  planSourceLinkFingerprint,
  sourceIdForUrl,
  validatePlanResearchSourceDraft,
  type PlanResearchSource,
  type PlanResearchSourceGateway
} from './types';

const workspaceRoot = (uid: string) => `users/${uid}/workspaces/default`;
const planRoot = (uid: string, planId: string) => `${workspaceRoot(uid)}/plans/${planId}`;
const validId = (value: string) => value.length >= 1 && value.length <= 128 && !value.includes('/');

export const firebasePlanResearchSourceGateway: PlanResearchSourceGateway = {
  async list(user, planId) {
    if (!validId(planId)) throw new Error('Plan not found.');
    const links = await getDocs(collection(db, planRoot(user.uid, planId), 'sourceLinks'));
    const values = await Promise.all(links.docs.map(async linkSnapshot => {
      const link = parsePlanSourceLink(linkSnapshot.data(), linkSnapshot.id, planId, user.uid);
      if (!link) throw new Error('Stored Plan source link failed validation.');
      const sourceSnapshot = await getDoc(doc(db, workspaceRoot(user.uid), 'researchSources', link.sourceId));
      const source = sourceSnapshot.exists() ? parseStoredResearchSource(sourceSnapshot.data(), sourceSnapshot.id, user.uid) : null;
      if (!source) throw new Error('Stored research source failed validation.');
      return { source, link };
    }));
    return values.sort((left, right) => right.link.createdAt.localeCompare(left.link.createdAt) || right.source.sourceId.localeCompare(left.source.sourceId));
  },

  async save(user, planId, requestId, draft) {
    if (!validId(planId)) throw new Error('Plan not found.');
    if (!validId(requestId) || Object.keys(validatePlanResearchSourceDraft(draft)).length > 0) throw new Error('Invalid research source.');
    const normalizedUrl = normalizeResearchUrl(draft.url)!;
    const sourceId = await sourceIdForUrl(normalizedUrl);
    const domain = new URL(normalizedUrl).hostname;
    const sourceReference = doc(db, workspaceRoot(user.uid), 'researchSources', sourceId);
    const planReference = doc(db, planRoot(user.uid, planId));
    const linkReference = doc(db, planRoot(user.uid, planId), 'sourceLinks', sourceId);
    const fingerprint = planSourceLinkFingerprint(draft, normalizedUrl);
    const duplicate = await runTransaction(db, async transaction => {
      const [planSnapshot, sourceSnapshot, linkSnapshot] = await Promise.all([
        transaction.get(planReference), transaction.get(sourceReference), transaction.get(linkReference)
      ]);
      if (!planSnapshot.exists() || planSnapshot.data().ownerUid !== user.uid) throw new Error('Plan not found.');
      if (linkSnapshot.exists()) {
        const link = parsePlanSourceLink(linkSnapshot.data(), linkSnapshot.id, planId, user.uid);
        if (!link) throw new Error('Stored Plan source link failed validation.');
        if (link.requestId === requestId && link.requestFingerprint !== fingerprint) throw new PlanResearchIdempotencyConflictError();
        if (link.requestFingerprint !== fingerprint) throw new DuplicateResearchSourceError();
        return true;
      }
      if (sourceSnapshot.exists()) {
        const source = parseStoredResearchSource(sourceSnapshot.data(), sourceSnapshot.id, user.uid);
        if (!source || source.normalizedUrl !== normalizedUrl) throw new DuplicateResearchSourceError();
      } else {
        transaction.set(sourceReference, {
          schemaVersion: 1, sourceId, ownerUid: user.uid, workspaceId: 'default',
          url: draft.url.trim(), normalizedUrl, domain, title: draft.title.trim(), excerpt: draft.excerpt.trim(),
          capturedBy: 'user', capturedAt: serverTimestamp()
        });
      }
      transaction.set(linkReference, {
        schemaVersion: 1, sourceId, planId, ownerUid: user.uid, workspaceId: 'default',
        note: draft.note.trim(), topic: draft.topic.trim(), state: 'inbox', requestId,
        requestFingerprint: fingerprint, createdAt: serverTimestamp()
      });
      return false;
    });
    const [sourceSnapshot, linkSnapshot] = await Promise.all([getDoc(sourceReference), getDoc(linkReference)]);
    const source = sourceSnapshot.exists() ? parseStoredResearchSource(sourceSnapshot.data(), sourceSnapshot.id, user.uid) : null;
    const link = linkSnapshot.exists() ? parsePlanSourceLink(linkSnapshot.data(), linkSnapshot.id, planId, user.uid) : null;
    if (!source || !link) throw new Error('Saved research source could not be restored.');
    return { value: { source, link }, duplicate };
  }
};
