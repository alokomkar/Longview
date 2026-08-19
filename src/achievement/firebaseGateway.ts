import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firestore';
import { parseStoredPlan } from '../plan/types';
import { parseTodayCompletion } from '../today/types';
import {
  AchievementConflictError,
  AchievementIdempotencyConflictError,
  AchievementValidationError,
  ReuseConsentConflictError,
  achievementFingerprint,
  normalizeAchievementDraft,
  parseAchievementRecord,
  parseReflectionRecord,
  parseReuseConsent,
  reflectionFieldIds,
  reuseConsentFingerprint,
  validAchievementId,
  validateAchievementDraft,
  type AchievementBundle,
  type AchievementGateway,
  type ReuseConsent
} from './types';

const planRoot = (uid: string, planId: string) => `users/${uid}/workspaces/default/plans/${planId}`;
const workspaceRoot = (uid: string) => `users/${uid}/workspaces/default`;
const validPlanId = (value: string) => value.length >= 1 && value.length <= 128 && !value.includes('/');

type AchievementState = {
  schemaVersion: 1;
  planId: string;
  ownerUid: string;
  workspaceId: 'default';
  currentAchievementId: string;
  currentConsentId: string;
  consentVersion: number;
};

const parseState = (value: unknown, planId: string, ownerUid: string): AchievementState | null => {
  if (typeof value !== 'object' || value === null) return null;
  const state = value as Partial<AchievementState>;
  if (state.schemaVersion !== 1 || state.planId !== planId || state.ownerUid !== ownerUid || state.workspaceId !== 'default' ||
      !validAchievementId(state.currentAchievementId) || !validAchievementId(state.currentConsentId) ||
      !Number.isInteger(state.consentVersion) || (state.consentVersion ?? 0) < 1) return null;
  return state as AchievementState;
};

async function completedStepIds(uid: string, planId: string) {
  const snapshots = await getDocs(collection(db, workspaceRoot(uid), 'todayCompletions'));
  const ids = snapshots.docs.map(snapshot => parseTodayCompletion(snapshot.data(), snapshot.id, uid))
    .filter(completion => completion?.planId === planId && completion.status === 'completed')
    .map(completion => completion!.id)
    .sort();
  return ids.slice(-1);
}

async function restoreBundle(uid: string, planId: string): Promise<AchievementBundle> {
  const base = planRoot(uid, planId);
  const [planSnapshot, stateSnapshot, stepIds] = await Promise.all([
    getDoc(doc(db, base)),
    getDoc(doc(db, base, 'achievementState', 'current')),
    completedStepIds(uid, planId)
  ]);
  const plan = planSnapshot.exists() ? parseStoredPlan(planSnapshot.data(), planSnapshot.id, uid) : null;
  if (!plan) throw new AchievementValidationError('Plan could not be restored.');
  if (!stateSnapshot.exists()) {
    if (plan.status === 'completed') throw new AchievementValidationError('Completed Plan is missing its achievement pointer.');
    return { completedStepIds: stepIds, requiredStepIds: ['first-proof-v1'], eligible: stepIds.length > 0, achievement: null, reflection: null, consent: null, consentVersion: 0 };
  }
  const state = parseState(stateSnapshot.data(), planId, uid);
  if (!state || plan.status !== 'completed' || plan.achievementId !== state.currentAchievementId) {
    throw new AchievementValidationError('Achievement pointer failed validation.');
  }
  const [achievementSnapshot, consentSnapshot] = await Promise.all([
    getDoc(doc(db, base, 'achievements', state.currentAchievementId)),
    getDoc(doc(db, base, 'reuseConsents', state.currentConsentId))
  ]);
  const achievement = achievementSnapshot.exists()
    ? parseAchievementRecord(achievementSnapshot.data(), achievementSnapshot.id, planId, uid)
    : null;
  const consent = consentSnapshot.exists()
    ? parseReuseConsent(consentSnapshot.data(), consentSnapshot.id, state.currentAchievementId, planId, uid)
    : null;
  if (!achievement || !consent || consent.version !== state.consentVersion ||
      consent.reflectionId !== achievement.reflectionId) throw new AchievementValidationError('Achievement record failed validation.');
  let reflection = null;
  if (achievement.reflectionId) {
    const snapshot = await getDoc(doc(db, base, 'reflections', achievement.reflectionId));
    reflection = snapshot.exists()
      ? parseReflectionRecord(snapshot.data(), snapshot.id, achievement.achievementId, planId, uid)
      : null;
    if (!reflection || consent.approvedReflectionFields.some(field => !reflection![field])) {
      throw new AchievementValidationError('Reflection record failed validation.');
    }
  } else if (consent.approvedReflectionFields.length > 0) {
    throw new AchievementValidationError('Reuse consent requires a reflection.');
  }
  return { completedStepIds: stepIds, requiredStepIds: ['first-proof-v1'], eligible: true, achievement, reflection, consent, consentVersion: state.consentVersion };
}

export const firebaseAchievementGateway: AchievementGateway = {
  async load(user, planId) {
    if (!validPlanId(planId)) throw new AchievementValidationError('Invalid Plan identifier.');
    return restoreBundle(user.uid, planId);
  },

  async finish(user, planId, request) {
    if (!validPlanId(planId) || !validAchievementId(request.achievementId) || !validAchievementId(request.reflectionId) ||
        !validAchievementId(request.consentId) || !Number.isInteger(request.expectedPlanRevision) || request.expectedPlanRevision < 1 ||
        request.completedStepIds.length < 1 || request.completedStepIds.length > 20 ||
        new Set(request.completedStepIds).size !== request.completedStepIds.length ||
        !request.completedStepIds.every(validAchievementId) || Object.keys(validateAchievementDraft(request.draft)).length > 0) {
      throw new AchievementValidationError();
    }
    const base = planRoot(user.uid, planId);
    const planReference = doc(db, base);
    const stateReference = doc(db, base, 'achievementState', 'current');
    const achievementReference = doc(db, base, 'achievements', request.achievementId);
    const reflectionReference = doc(db, base, 'reflections', request.reflectionId);
    const consentReference = doc(db, base, 'reuseConsents', request.consentId);
    const completionReferences = request.completedStepIds.map(id => doc(db, workspaceRoot(user.uid), 'todayCompletions', id));
    const draft = normalizeAchievementDraft(request.draft);
    const requestFingerprint = achievementFingerprint({ ...request, draft });
    const hasReflection = reflectionFieldIds.some(field => draft.reflection[field].length > 0);
    const reflectionId = hasReflection ? request.reflectionId : null;
    const consentFingerprint = reuseConsentFingerprint(request.achievementId, reflectionId, draft.approvedReflectionFields, 1, null);

    const duplicate = await runTransaction(db, async transaction => {
      const [planSnapshot, stateSnapshot, achievementSnapshot, reflectionSnapshot, consentSnapshot, ...completionSnapshots] = await Promise.all([
        transaction.get(planReference), transaction.get(stateReference), transaction.get(achievementReference),
        transaction.get(reflectionReference), transaction.get(consentReference),
        ...completionReferences.map(reference => transaction.get(reference))
      ]);
      const plan = planSnapshot.exists() ? parseStoredPlan(planSnapshot.data(), planSnapshot.id, user.uid) : null;
      if (!plan) throw new AchievementValidationError('Plan not found.');
      if (achievementSnapshot.exists()) {
        const achievement = parseAchievementRecord(achievementSnapshot.data(), achievementSnapshot.id, planId, user.uid);
        const state = stateSnapshot.exists() ? parseState(stateSnapshot.data(), planId, user.uid) : null;
        const consent = consentSnapshot.exists()
          ? parseReuseConsent(consentSnapshot.data(), consentSnapshot.id, request.achievementId, planId, user.uid)
          : null;
        if (!achievement || achievement.requestFingerprint !== requestFingerprint || !state ||
            state.currentAchievementId !== request.achievementId || state.currentConsentId !== request.consentId ||
            !consent || consent.requestFingerprint !== consentFingerprint) throw new AchievementIdempotencyConflictError();
        return true;
      }
      if (stateSnapshot.exists() || plan.status !== 'active' || plan.scheduleVersion !== request.expectedPlanRevision) {
        throw new AchievementConflictError();
      }
      if (reflectionSnapshot.exists() || consentSnapshot.exists()) throw new AchievementIdempotencyConflictError();
      const completions = completionSnapshots.map((snapshot, index) =>
        snapshot.exists() ? parseTodayCompletion(snapshot.data(), snapshot.id, user.uid) : null
      );
      if (completions.some(completion => !completion || completion.planId !== planId || completion.stepKey !== 'first-proof-v1')) {
        throw new AchievementConflictError('Required completion evidence changed.');
      }
      transaction.set(achievementReference, {
        schemaVersion: 1, achievementId: request.achievementId, planId, ownerUid: user.uid,
        workspaceId: 'default', outcome: draft.outcome, evidence: draft.evidence,
        completedStepIds: [...request.completedStepIds].sort(), expectedPlanRevision: request.expectedPlanRevision,
        reflectionId, requestFingerprint, recordedAt: serverTimestamp()
      });
      if (reflectionId) transaction.set(reflectionReference, {
        schemaVersion: 1, reflectionId, achievementId: request.achievementId, planId,
        ownerUid: user.uid, workspaceId: 'default', ...draft.reflection, recordedAt: serverTimestamp()
      });
      transaction.set(consentReference, {
        schemaVersion: 1, consentId: request.consentId, achievementId: request.achievementId,
        reflectionId, planId, ownerUid: user.uid, workspaceId: 'default', purpose: 'future_plan_guidance',
        approvedReflectionFields: draft.approvedReflectionFields, version: 1, previousConsentId: null,
        requestFingerprint: consentFingerprint, recordedAt: serverTimestamp()
      });
      transaction.set(stateReference, {
        schemaVersion: 1, planId, ownerUid: user.uid, workspaceId: 'default',
        currentAchievementId: request.achievementId, currentConsentId: request.consentId,
        consentVersion: 1, updatedAt: serverTimestamp()
      });
      transaction.update(planReference, {
        status: 'completed', schemaVersion: 3, achievementId: request.achievementId,
        completedAt: serverTimestamp(), completionVersion: 1, updatedAt: serverTimestamp()
      });
      return false;
    });
    const [bundle, planSnapshot] = await Promise.all([restoreBundle(user.uid, planId), getDoc(planReference)]);
    const plan = planSnapshot.exists() ? parseStoredPlan(planSnapshot.data(), planSnapshot.id, user.uid) : null;
    if (!plan || plan.status !== 'completed') throw new AchievementValidationError('Completed Plan could not be restored.');
    return { bundle, plan, duplicate };
  },

  async revokeReuse(user, planId, request) {
    if (!validPlanId(planId) || !validAchievementId(request.consentId) ||
        !Number.isInteger(request.expectedConsentVersion) || request.expectedConsentVersion < 1) {
      throw new AchievementValidationError('Invalid revocation request.');
    }
    const base = planRoot(user.uid, planId);
    const stateReference = doc(db, base, 'achievementState', 'current');
    const consentReference = doc(db, base, 'reuseConsents', request.consentId);
    const duplicate = await runTransaction(db, async transaction => {
      const [stateSnapshot, existingSnapshot] = await Promise.all([
        transaction.get(stateReference), transaction.get(consentReference)
      ]);
      const state = stateSnapshot.exists() ? parseState(stateSnapshot.data(), planId, user.uid) : null;
      if (!state) throw new AchievementValidationError('Achievement state is unavailable.');
      const currentReference = doc(db, base, 'reuseConsents', state.currentConsentId);
      const currentSnapshot = await transaction.get(currentReference);
      const current = currentSnapshot.exists()
        ? parseReuseConsent(currentSnapshot.data(), currentSnapshot.id, state.currentAchievementId, planId, user.uid)
        : null;
      if (!current) throw new AchievementValidationError('Current reuse consent is unavailable.');
      const version = request.expectedConsentVersion + 1;
      const fingerprint = reuseConsentFingerprint(state.currentAchievementId, current.reflectionId, [], version, current.consentId);
      if (existingSnapshot.exists()) {
        const existing = parseReuseConsent(existingSnapshot.data(), existingSnapshot.id, state.currentAchievementId, planId, user.uid);
        if (!existing || existing.requestFingerprint !== fingerprint || state.currentConsentId !== request.consentId) {
          throw new AchievementIdempotencyConflictError();
        }
        return true;
      }
      if (state.consentVersion !== request.expectedConsentVersion) throw new ReuseConsentConflictError();
      transaction.set(consentReference, {
        schemaVersion: 1, consentId: request.consentId, achievementId: state.currentAchievementId,
        reflectionId: current.reflectionId, planId, ownerUid: user.uid, workspaceId: 'default',
        purpose: 'future_plan_guidance', approvedReflectionFields: [], version,
        previousConsentId: current.consentId, requestFingerprint: fingerprint, recordedAt: serverTimestamp()
      });
      transaction.update(stateReference, {
        currentConsentId: request.consentId, consentVersion: version, updatedAt: serverTimestamp()
      });
      return false;
    });
    const snapshot = await getDoc(consentReference);
    const stateSnapshot = await getDoc(stateReference);
    const state = stateSnapshot.exists() ? parseState(stateSnapshot.data(), planId, user.uid) : null;
    const consent: ReuseConsent | null = snapshot.exists() && state
      ? parseReuseConsent(snapshot.data(), snapshot.id, state.currentAchievementId, planId, user.uid)
      : null;
    if (!consent) throw new AchievementValidationError('Revocation could not be restored.');
    return { consent, duplicate };
  }
};
