import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/firestore';
import {
  PlanBriefConflictError,
  PlanMemoryIdempotencyConflictError,
  ResearchConflictError,
  parsePlanBriefVersion,
  parseResearchReview,
  parseStoredResearchCard,
  planBriefFingerprint,
  researchCardFingerprint,
  researchReviewFingerprint,
  validatePlanBriefDraft,
  validateResearchCandidate,
  type PlanMemoryGateway,
  type ResearchDecision,
  type ReviewedResearch
} from './types';

const root = (uid: string, planId: string) =>
  `users/${uid}/workspaces/default/plans/${planId}`;
const validId = (value: string) => value.length >= 8 && value.length <= 128 && !value.includes('/');
const validPlanId = (value: string) => value.length >= 1 && value.length <= 128 && !value.includes('/');
const validDecision = (value: unknown): value is ResearchDecision =>
  value === 'accepted' || value === 'rejected' || value === 'deferred';

type ResearchState = {
  researchId: string;
  planId: string;
  ownerUid: string;
  workspaceId: 'default';
  currentDecision: ResearchDecision;
  revision: number;
  latestReviewId: string;
  reviewedAt: unknown;
  schemaVersion: 1;
};

const parseState = (value: unknown, researchId: string, planId: string, ownerUid: string): ResearchState | null => {
  if (typeof value !== 'object' || value === null) return null;
  const state = value as Partial<ResearchState>;
  if (state.researchId !== researchId || state.planId !== planId || state.ownerUid !== ownerUid ||
      state.workspaceId !== 'default' || state.schemaVersion !== 1 || !validDecision(state.currentDecision) ||
      !Number.isInteger(state.revision) || (state.revision ?? 0) < 1 || !validId(state.latestReviewId ?? '')) return null;
  return state as ResearchState;
};

async function restoreResearch(uid: string, planId: string, researchId: string): Promise<ReviewedResearch> {
  const base = root(uid, planId);
  const [cardSnapshot, stateSnapshot] = await Promise.all([
    getDoc(doc(db, base, 'research', researchId)),
    getDoc(doc(db, base, 'researchState', researchId))
  ]);
  const card = cardSnapshot.exists() ? parseStoredResearchCard(cardSnapshot.data(), researchId, planId, uid) : null;
  const state = stateSnapshot.exists() ? parseState(stateSnapshot.data(), researchId, planId, uid) : null;
  if (!card || !state) throw new Error('Stored research failed validation.');
  const reviewSnapshot = await getDoc(doc(db, base, 'researchReviews', state.latestReviewId));
  const review = reviewSnapshot.exists() ? parseResearchReview(reviewSnapshot.data(), reviewSnapshot.id, planId, uid) : null;
  if (!review || review.researchId !== researchId || review.revision !== state.revision || review.decision !== state.currentDecision) {
    throw new Error('Stored research review failed validation.');
  }
  return { card, decision: review.decision, revision: review.revision, latestReviewId: review.reviewId, reviewedAt: review.reviewedAt };
}

export const firebasePlanMemoryGateway: PlanMemoryGateway = {
  async loadResearch(user, planId) {
    if (!validPlanId(planId)) throw new Error('Invalid Plan identifier.');
    const snapshots = await getDocs(collection(db, root(user.uid, planId), 'researchState'));
    return Promise.all(snapshots.docs.map(snapshot => restoreResearch(user.uid, planId, snapshot.id))).then(values =>
      values.sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt) || right.card.researchId.localeCompare(left.card.researchId))
    );
  },

  async loadBrief(user, planId) {
    if (!validPlanId(planId)) throw new Error('Invalid Plan identifier.');
    const base = root(user.uid, planId);
    const [versionsSnapshot, stateSnapshot] = await Promise.all([
      getDocs(collection(db, base, 'briefVersions')),
      getDoc(doc(db, base, 'briefState', 'current'))
    ]);
    const versions = versionsSnapshot.docs.map(snapshot => {
      const version = parsePlanBriefVersion(snapshot.data(), snapshot.id, planId, user.uid);
      if (!version) throw new Error('Stored Plan Brief failed validation.');
      return version;
    }).sort((left, right) => right.version - left.version || right.versionId.localeCompare(left.versionId));
    if (!stateSnapshot.exists()) {
      if (versions.length > 0) throw new Error('Plan Brief pointer is missing.');
      return { briefVersions: [], currentBrief: null, briefVersion: 0 };
    }
    const value = stateSnapshot.data();
    if (value.planId !== planId || value.ownerUid !== user.uid || value.workspaceId !== 'default' ||
        value.schemaVersion !== 1 || !Number.isInteger(value.currentVersion) || value.currentVersion < 1 ||
        !validId(value.currentVersionId)) throw new Error('Stored Plan Brief pointer failed validation.');
    const currentBrief = versions.find(version => version.versionId === value.currentVersionId && version.version === value.currentVersion);
    if (!currentBrief) throw new Error('Current Plan Brief could not be restored.');
    return { briefVersions: versions, currentBrief, briefVersion: value.currentVersion };
  },

  async reviewResearch(user, planId, reviewId, candidate, decision, expectedRevision) {
    if (!validPlanId(planId) || !validId(reviewId) || !validDecision(decision) ||
        !Number.isInteger(expectedRevision) || expectedRevision < 0 ||
        !validateResearchCandidate(candidate, candidate.requestId, planId)) throw new Error('Research review failed validation.');
    const base = root(user.uid, planId);
    const planReference = doc(db, base);
    const cardReference = doc(db, base, 'research', candidate.researchId);
    const stateReference = doc(db, base, 'researchState', candidate.researchId);
    const reviewReference = doc(db, base, 'researchReviews', reviewId);
    const requestFingerprint = researchReviewFingerprint(candidate, decision);
    const duplicate = await runTransaction(db, async transaction => {
      const [planSnapshot, existingReview, cardSnapshot, stateSnapshot] = await Promise.all([
        transaction.get(planReference), transaction.get(reviewReference),
        transaction.get(cardReference), transaction.get(stateReference)
      ]);
      if (!planSnapshot.exists() || planSnapshot.data().ownerUid !== user.uid) throw new Error('Plan not found.');
      if (existingReview.exists()) {
        const review = parseResearchReview(existingReview.data(), existingReview.id, planId, user.uid);
        if (!review || review.requestFingerprint !== requestFingerprint) throw new PlanMemoryIdempotencyConflictError();
        return true;
      }
      const cardFingerprint = researchCardFingerprint(candidate);
      if (cardSnapshot.exists()) {
        const stored = parseStoredResearchCard(cardSnapshot.data(), cardSnapshot.id, planId, user.uid);
        if (!stored || stored.cardFingerprint !== cardFingerprint) throw new PlanMemoryIdempotencyConflictError();
      }
      const state = stateSnapshot.exists() ? parseState(stateSnapshot.data(), candidate.researchId, planId, user.uid) : null;
      const currentRevision = state?.revision ?? 0;
      if (stateSnapshot.exists() && !state) throw new Error('Stored research state failed validation.');
      if (currentRevision !== expectedRevision) throw new ResearchConflictError();
      const revision = expectedRevision + 1;
      if (!cardSnapshot.exists()) transaction.set(cardReference, {
        ...candidate, planId, ownerUid: user.uid, workspaceId: 'default', cardFingerprint,
        createdAt: serverTimestamp()
      });
      transaction.set(reviewReference, {
        schemaVersion: 1, reviewId, researchId: candidate.researchId, planId,
        ownerUid: user.uid, workspaceId: 'default', decision, revision,
        requestFingerprint, reviewedAt: serverTimestamp()
      });
      transaction.set(stateReference, {
        schemaVersion: 1, researchId: candidate.researchId, planId,
        ownerUid: user.uid, workspaceId: 'default', currentDecision: decision,
        revision, latestReviewId: reviewId, reviewedAt: serverTimestamp()
      });
      return false;
    });
    return { research: await restoreResearch(user.uid, planId, candidate.researchId), duplicate };
  },

  async saveBrief(user, planId, versionId, draft, expectedVersion) {
    if (!validPlanId(planId) || !validId(versionId) || !Number.isInteger(expectedVersion) || expectedVersion < 0 ||
        Object.keys(validatePlanBriefDraft(draft)).length > 0) throw new Error('Plan Brief failed validation.');
    const base = root(user.uid, planId);
    const planReference = doc(db, base);
    const stateReference = doc(db, base, 'briefState', 'current');
    const versionReference = doc(db, base, 'briefVersions', versionId);
    const fingerprint = planBriefFingerprint(draft);
    const duplicate = await runTransaction(db, async transaction => {
      const [planSnapshot, existingVersion, stateSnapshot, ...researchStates] = await Promise.all([
        transaction.get(planReference), transaction.get(versionReference), transaction.get(stateReference),
        ...draft.sourceResearchIds.map(id => transaction.get(doc(db, base, 'researchState', id)))
      ]);
      if (!planSnapshot.exists() || planSnapshot.data().ownerUid !== user.uid) throw new Error('Plan not found.');
      if (existingVersion.exists()) {
        const version = parsePlanBriefVersion(existingVersion.data(), existingVersion.id, planId, user.uid);
        if (!version || version.requestFingerprint !== fingerprint) throw new PlanMemoryIdempotencyConflictError();
        return true;
      }
      const currentVersion = stateSnapshot.exists() ? stateSnapshot.data().currentVersion : 0;
      if (!Number.isInteger(currentVersion) || currentVersion !== expectedVersion) throw new PlanBriefConflictError();
      for (let index = 0; index < researchStates.length; index += 1) {
        const snapshot = researchStates[index];
        const state = snapshot.exists() ? parseState(snapshot.data(), draft.sourceResearchIds[index], planId, user.uid) : null;
        if (!state || state.currentDecision !== 'accepted') throw new PlanBriefConflictError();
      }
      const version = expectedVersion + 1;
      transaction.set(versionReference, {
        ...draft, focus: draft.focus.trim(), approach: draft.approach.trim(),
        successEvidence: draft.successEvidence.trim(), sourceResearchIds: [...draft.sourceResearchIds].sort(),
        schemaVersion: 1, versionId, version, planId, ownerUid: user.uid, workspaceId: 'default',
        requestFingerprint: fingerprint, recordedAt: serverTimestamp()
      });
      transaction.set(stateReference, {
        schemaVersion: 1, planId, ownerUid: user.uid, workspaceId: 'default',
        currentVersion: version, currentVersionId: versionId, updatedAt: serverTimestamp()
      });
      return false;
    });
    const snapshot = await getDoc(versionReference);
    const brief = snapshot.exists() ? parsePlanBriefVersion(snapshot.data(), snapshot.id, planId, user.uid) : null;
    if (!brief) throw new Error('Saved Plan Brief could not be restored.');
    return { brief, duplicate };
  }
};
