import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firestore';
import { toIso } from '../planRecord/types';
import {
  DuplicateResearchSourceError,
  PlanResearchConflictError,
  PlanResearchIdempotencyConflictError,
  normalizePlanIds,
  normalizeResearchUrl,
  parseResearchSourceState,
  parseStoredResearchSource,
  parseWikiPage,
  parseWikiVersion,
  sourceCreateFingerprint,
  sourceIdForUrl,
  sourceStateFingerprint,
  validatePlanResearchSourceDraft,
  validateResearchSourceStateDraft,
  validateWikiBriefDraft,
  validateWikiDraft,
  wikiBriefFingerprint,
  wikiFingerprint,
  type PlanResearchSourceGateway,
  type ResearchSourceState,
  type ResearchSourceStateDraft,
  type WikiVersion,
  type WorkspaceResearchSource
} from './types';

const workspaceRoot = (uid: string) => `users/${uid}/workspaces/default`;
const planRoot = (uid: string, planId: string) => `${workspaceRoot(uid)}/plans/${planId}`;
const validId = (value: string, minimum = 1) => value.length >= minimum && value.length <= 128 && !value.includes('/');
const normalizeKnownPlanIds = (values: string[]) => {
  if (!Array.isArray(values)) return null;
  const normalized = [...new Set(values)].sort();
  return normalized.length <= 50 && normalized.every(value => validId(value)) ? normalized : null;
};

type LegacyLink = { note: string; topic: string; createdAt: string };
const parseLegacyLink = (value: unknown): LegacyLink | null => {
  if (typeof value !== 'object' || value === null) return null;
  const link = value as { note?: unknown; topic?: unknown; createdAt?: unknown };
  const createdAt = toIso(link.createdAt);
  if (typeof link.note !== 'string' || link.note.trim().length < 3 || typeof link.topic !== 'string' || link.topic.trim().length < 2 || !createdAt) return null;
  return { note: link.note, topic: link.topic, createdAt };
};

const eventValue = (sourceId: string, eventId: string, uid: string, kind: 'created' | 'organized', fromRevision: number, state: ResearchSourceStateDraft, fingerprint: string) => ({
  schemaVersion: 1, sourceId, eventId, ownerUid: uid, workspaceId: 'default', kind,
  fromRevision, toRevision: fromRevision + 1, note: state.note.trim(), topic: state.topic.trim(),
  workflowState: state.workflowState, planIds: normalizePlanIds(state.planIds), requestFingerprint: fingerprint,
  recordedAt: serverTimestamp()
});

const stateValue = (sourceId: string, eventId: string, uid: string, revision: number, state: ResearchSourceStateDraft) => ({
  schemaVersion: 1, sourceId, ownerUid: uid, workspaceId: 'default', note: state.note.trim(), topic: state.topic.trim(),
  workflowState: state.workflowState, planIds: normalizePlanIds(state.planIds), revision, latestEventId: eventId, updatedAt: serverTimestamp()
});

async function restore(uid: string, sourceId: string): Promise<WorkspaceResearchSource> {
  const base = workspaceRoot(uid);
  const [sourceSnapshot, stateSnapshot] = await Promise.all([
    getDoc(doc(db, base, 'researchSources', sourceId)), getDoc(doc(db, base, 'researchSourceStates', sourceId))
  ]);
  const source = sourceSnapshot.exists() ? parseStoredResearchSource(sourceSnapshot.data(), sourceSnapshot.id, uid) : null;
  const state = stateSnapshot.exists() ? parseResearchSourceState(stateSnapshot.data(), stateSnapshot.id, uid) : null;
  if (!source || !state) throw new Error('Saved research source could not be restored.');
  return { source, state };
}

export const firebasePlanResearchSourceGateway: PlanResearchSourceGateway = {
  async list(user, requestedPlanIds) {
    const planIds = normalizeKnownPlanIds(requestedPlanIds);
    if (!planIds) throw new Error('Invalid Plan identifiers.');
    const base = workspaceRoot(user.uid);
    const [sourceSnapshots, stateSnapshots, legacyCollections] = await Promise.all([
      getDocs(collection(db, base, 'researchSources')),
      getDocs(collection(db, base, 'researchSourceStates')),
      Promise.all(planIds.map(planId => getDocs(collection(db, planRoot(user.uid, planId), 'sourceLinks'))))
    ]);
    const states = new Map<string, ResearchSourceState>();
    for (const snapshot of stateSnapshots.docs) {
      const state = parseResearchSourceState(snapshot.data(), snapshot.id, user.uid);
      if (!state) throw new Error('Stored research organization failed validation.');
      states.set(snapshot.id, state);
    }
    const legacy = new Map<string, { planIds: string[]; link: LegacyLink }>();
    legacyCollections.forEach((snapshots, index) => snapshots.docs.forEach(snapshot => {
      const link = parseLegacyLink(snapshot.data());
      if (!link) throw new Error('Stored legacy Plan source link failed validation.');
      const current = legacy.get(snapshot.id);
      legacy.set(snapshot.id, { planIds: [...(current?.planIds ?? []), planIds[index]].sort(), link: current?.link ?? link });
    }));
    return sourceSnapshots.docs.map(snapshot => {
      const source = parseStoredResearchSource(snapshot.data(), snapshot.id, user.uid);
      if (!source) throw new Error('Stored research source failed validation.');
      const persisted = states.get(source.sourceId);
      const old = legacy.get(source.sourceId);
      if (!persisted && !old) throw new Error('Research source organization is missing.');
      const state = persisted ?? {
        schemaVersion: 1, sourceId: source.sourceId, ownerUid: user.uid, workspaceId: 'default', note: old!.link.note,
        topic: old!.link.topic, workflowState: 'inbox', planIds: old!.planIds, revision: 0,
        latestEventId: `legacy-${source.sourceId.slice(0, 12)}`, updatedAt: old!.link.createdAt
      } satisfies ResearchSourceState;
      return { source, state };
    }).sort((left, right) => right.state.updatedAt.localeCompare(left.state.updatedAt) || right.source.sourceId.localeCompare(left.source.sourceId));
  },

  async save(user, requestId, draft, state) {
    if (!validId(requestId, 8) || Object.keys(validatePlanResearchSourceDraft(draft)).length > 0 || !validateResearchSourceStateDraft(state)) {
      throw new Error('Invalid research source.');
    }
    const normalizedUrl = normalizeResearchUrl(draft.url)!;
    const sourceId = await sourceIdForUrl(normalizedUrl);
    const base = workspaceRoot(user.uid);
    const sourceReference = doc(db, base, 'researchSources', sourceId);
    const stateReference = doc(db, base, 'researchSourceStates', sourceId);
    const eventReference = doc(db, base, 'researchSourceEvents', requestId);
    const planReferences = normalizePlanIds(state.planIds)!.map(planId => doc(db, planRoot(user.uid, planId)));
    const fingerprint = sourceCreateFingerprint(draft, normalizedUrl, state);
    const duplicate = await runTransaction(db, async transaction => {
      const [sourceSnapshot, stateSnapshot, eventSnapshot, ...planSnapshots] = await Promise.all([
        transaction.get(sourceReference), transaction.get(stateReference), transaction.get(eventReference),
        ...planReferences.map(reference => transaction.get(reference))
      ]);
      if (planSnapshots.some(snapshot => !snapshot.exists() || snapshot.data().ownerUid !== user.uid)) throw new Error('Plan not found.');
      if (eventSnapshot.exists()) {
        if (eventSnapshot.data().requestFingerprint !== fingerprint || eventSnapshot.data().sourceId !== sourceId) throw new PlanResearchIdempotencyConflictError();
        return true;
      }
      if (sourceSnapshot.exists() || stateSnapshot.exists()) throw new DuplicateResearchSourceError();
      transaction.set(sourceReference, {
        schemaVersion: 1, sourceId, ownerUid: user.uid, workspaceId: 'default', url: draft.url.trim(), normalizedUrl,
        domain: new URL(normalizedUrl).hostname, title: draft.title.trim(), excerpt: draft.excerpt.trim(), capturedBy: 'user', capturedAt: serverTimestamp()
      });
      transaction.set(eventReference, eventValue(sourceId, requestId, user.uid, 'created', 0, state, fingerprint));
      transaction.set(stateReference, stateValue(sourceId, requestId, user.uid, 1, state));
      return false;
    });
    return { value: await restore(user.uid, sourceId), duplicate };
  },

  async update(user, sourceId, eventId, expectedRevision, state) {
    if (!validId(sourceId, 64) || !validId(eventId, 8) || !Number.isInteger(expectedRevision) || expectedRevision < 0 || !validateResearchSourceStateDraft(state)) {
      throw new Error('Invalid research organization.');
    }
    const base = workspaceRoot(user.uid);
    const sourceReference = doc(db, base, 'researchSources', sourceId);
    const stateReference = doc(db, base, 'researchSourceStates', sourceId);
    const eventReference = doc(db, base, 'researchSourceEvents', eventId);
    const planReferences = normalizePlanIds(state.planIds)!.map(planId => doc(db, planRoot(user.uid, planId)));
    const fingerprint = sourceStateFingerprint(state);
    const duplicate = await runTransaction(db, async transaction => {
      const [sourceSnapshot, stateSnapshot, eventSnapshot, ...planSnapshots] = await Promise.all([
        transaction.get(sourceReference), transaction.get(stateReference), transaction.get(eventReference),
        ...planReferences.map(reference => transaction.get(reference))
      ]);
      if (!sourceSnapshot.exists() || sourceSnapshot.data().ownerUid !== user.uid) throw new Error('Source not found.');
      if (planSnapshots.some(snapshot => !snapshot.exists() || snapshot.data().ownerUid !== user.uid)) throw new Error('Plan not found.');
      if (eventSnapshot.exists()) {
        if (eventSnapshot.data().requestFingerprint !== fingerprint || eventSnapshot.data().sourceId !== sourceId) throw new PlanResearchIdempotencyConflictError();
        return true;
      }
      const current = stateSnapshot.exists() ? parseResearchSourceState(stateSnapshot.data(), sourceId, user.uid) : null;
      if (stateSnapshot.exists() && !current) throw new Error('Stored research organization failed validation.');
      if ((current?.revision ?? 0) !== expectedRevision) throw new PlanResearchConflictError();
      transaction.set(eventReference, eventValue(sourceId, eventId, user.uid, 'organized', expectedRevision, state, fingerprint));
      transaction.set(stateReference, stateValue(sourceId, eventId, user.uid, expectedRevision + 1, state));
      return false;
    });
    return { value: await restore(user.uid, sourceId), duplicate };
  },

  async loadWiki(user, planId) {
    if (!validId(planId)) throw new Error('Invalid Plan identifier.');
    const base = planRoot(user.uid, planId);
    const [pageSnapshots, versionSnapshots, briefState] = await Promise.all([
      getDocs(collection(db, base, 'wikiPages')), getDocs(collection(db, base, 'wikiVersions')), getDoc(doc(db, base, 'briefState', 'current'))
    ]);
    const versions = versionSnapshots.docs.map(snapshot => {
      const value = parseWikiVersion(snapshot.data(), snapshot.id, planId, user.uid);
      if (!value) throw new Error('Stored Wiki version failed validation.');
      return value;
    });
    const pages = pageSnapshots.docs.map(snapshot => {
      const page = parseWikiPage(snapshot.data(), snapshot.id, planId, user.uid);
      if (!page) throw new Error('Stored Wiki page failed validation.');
      const pageVersions = versions.filter(version => version.pageId === page.pageId).sort((a, b) => b.version - a.version);
      const current = pageVersions.find(version => version.versionId === page.currentVersionId && version.version === page.currentVersion);
      if (!current) throw new Error('Current Wiki version could not be restored.');
      return { page, current, versions: pageVersions };
    }).sort((a, b) => b.page.updatedAt.localeCompare(a.page.updatedAt));
    const briefVersion = briefState.exists() && Number.isInteger(briefState.data().currentVersion) ? briefState.data().currentVersion : 0;
    return { pages, briefVersion };
  },

  async saveWiki(user, planId, versionId, expectedVersion, draft) {
    if (!validId(planId) || !validId(versionId, 8) || !Number.isInteger(expectedVersion) || expectedVersion < 0 || Object.keys(validateWikiDraft(draft)).length > 0) {
      throw new Error('Invalid Wiki revision.');
    }
    const base = planRoot(user.uid, planId);
    const pageReference = doc(db, base, 'wikiPages', draft.pageId);
    const versionReference = doc(db, base, 'wikiVersions', versionId);
    const planReference = doc(db, base);
    const stateReferences = draft.citations.map(citation => doc(db, workspaceRoot(user.uid), 'researchSourceStates', citation.sourceId));
    const fingerprint = wikiFingerprint(draft);
    const duplicate = await runTransaction(db, async transaction => {
      const [planSnapshot, pageSnapshot, versionSnapshot, ...sourceStates] = await Promise.all([
        transaction.get(planReference), transaction.get(pageReference), transaction.get(versionReference),
        ...stateReferences.map(reference => transaction.get(reference))
      ]);
      if (!planSnapshot.exists() || planSnapshot.data().ownerUid !== user.uid) throw new Error('Plan not found.');
      if (versionSnapshot.exists()) {
        const existing = parseWikiVersion(versionSnapshot.data(), versionId, planId, user.uid);
        if (!existing || existing.requestFingerprint !== fingerprint) throw new PlanResearchIdempotencyConflictError();
        return true;
      }
      const page = pageSnapshot.exists() ? parseWikiPage(pageSnapshot.data(), draft.pageId, planId, user.uid) : null;
      if (pageSnapshot.exists() && !page) throw new Error('Stored Wiki page failed validation.');
      if ((page?.currentVersion ?? 0) !== expectedVersion) throw new PlanResearchConflictError('This Wiki page changed in another session.');
      sourceStates.forEach((snapshot, index) => {
        const state = snapshot.exists() ? parseResearchSourceState(snapshot.data(), draft.citations[index].sourceId, user.uid) : null;
        if (!state || state.workflowState !== 'useful' || !state.planIds.includes(planId)) throw new PlanResearchConflictError('A cited source is no longer marked useful for this Plan.');
      });
      const version = expectedVersion + 1;
      transaction.set(versionReference, {
        schemaVersion: 1, versionId, version, pageId: draft.pageId, planId, ownerUid: user.uid, workspaceId: 'default',
        title: draft.title.trim(), body: draft.body.trim(), citations: draft.citations.map(value => ({ sourceId: value.sourceId, statement: value.statement.trim() })),
        requestFingerprint: fingerprint, recordedAt: serverTimestamp()
      });
      transaction.set(pageReference, {
        schemaVersion: 1, pageId: draft.pageId, planId, ownerUid: user.uid, workspaceId: 'default', title: draft.title.trim(),
        currentVersion: version, currentVersionId: versionId, updatedAt: serverTimestamp()
      });
      return false;
    });
    const snapshot = await getDoc(versionReference);
    const value = snapshot.exists() ? parseWikiVersion(snapshot.data(), versionId, planId, user.uid) : null;
    if (!value) throw new Error('Saved Wiki revision could not be restored.');
    return { value, duplicate };
  },

  async promoteWiki(user, planId, versionId, expectedBriefVersion, wikiVersionId, draft) {
    if (!validId(planId) || !validId(versionId, 8) || !validId(wikiVersionId, 8) || !Number.isInteger(expectedBriefVersion) || expectedBriefVersion < 0 ||
        Object.keys(validateWikiBriefDraft(draft)).length > 0) throw new Error('Invalid Plan Brief proposal.');
    const base = planRoot(user.uid, planId);
    const planReference = doc(db, base);
    const wikiReference = doc(db, base, 'wikiVersions', wikiVersionId);
    const stateReference = doc(db, base, 'briefState', 'current');
    const versionReference = doc(db, base, 'briefVersions', versionId);
    const fingerprint = wikiBriefFingerprint(wikiVersionId, draft);
    const duplicate = await runTransaction(db, async transaction => {
      const [planSnapshot, wikiSnapshot, stateSnapshot, versionSnapshot] = await Promise.all([
        transaction.get(planReference), transaction.get(wikiReference), transaction.get(stateReference), transaction.get(versionReference)
      ]);
      if (!planSnapshot.exists() || planSnapshot.data().ownerUid !== user.uid) throw new Error('Plan not found.');
      const wiki = wikiSnapshot.exists() ? parseWikiVersion(wikiSnapshot.data(), wikiVersionId, planId, user.uid) : null;
      if (!wiki) throw new PlanResearchConflictError('The cited Wiki version is unavailable.');
      if (versionSnapshot.exists()) {
        if (versionSnapshot.data().requestFingerprint !== fingerprint || versionSnapshot.data().sourceWikiVersionId !== wikiVersionId) throw new PlanResearchIdempotencyConflictError();
        return true;
      }
      const current = stateSnapshot.exists() ? stateSnapshot.data().currentVersion : 0;
      if (!Number.isInteger(current) || current !== expectedBriefVersion) throw new PlanResearchConflictError('A newer Plan Brief already exists.');
      const version = expectedBriefVersion + 1;
      transaction.set(versionReference, {
        schemaVersion: 1, versionId, version, planId, ownerUid: user.uid, workspaceId: 'default', focus: draft.focus.trim(),
        approach: draft.approach.trim(), successEvidence: draft.successEvidence.trim(), sourceResearchIds: [], sourceWikiVersionId: wikiVersionId,
        requestFingerprint: fingerprint, recordedAt: serverTimestamp()
      });
      transaction.set(stateReference, {
        schemaVersion: 1, planId, ownerUid: user.uid, workspaceId: 'default', currentVersion: version,
        currentVersionId: versionId, updatedAt: serverTimestamp()
      });
      return false;
    });
    return { version: expectedBriefVersion + 1, duplicate };
  }
};
