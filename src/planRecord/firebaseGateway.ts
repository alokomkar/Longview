import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase/firestore';
import {
  PlanRecordConflictError,
  newestFirst,
  parsePlanRecord,
  planRecordFingerprint,
  toIso,
  validatePlanRecordDraft,
  type PlanHistoryEntry,
  type PlanRecord,
  type PlanRecordGateway
} from './types';

const root = (uid: string) => `users/${uid}/workspaces/default`;
const recordRef = (uid: string, planId: string, recordId: string) =>
  doc(db, root(uid), 'plans', planId, 'records', recordId);

const validPlanId = (value: string) => value.length >= 1 && value.length <= 128 && !value.includes('/');
const validRecordId = (value: string) => value.length >= 8 && value.length <= 128 && !value.includes('/');

export const firebasePlanRecordGateway: PlanRecordGateway = {
  async load(user, planId) {
    if (!validPlanId(planId)) throw new Error('Invalid Plan identifier.');
    const [recordsSnapshot, completionsSnapshot, auditSnapshot] = await Promise.all([
      getDocs(collection(db, root(user.uid), 'plans', planId, 'records')),
      getDocs(query(collection(db, root(user.uid), 'todayCompletions'), where('planId', '==', planId))),
      getDocs(query(collection(db, root(user.uid), 'auditEvents'), where('planId', '==', planId)))
    ]);
    const records = recordsSnapshot.docs.map(snapshot => {
      const record = parsePlanRecord(snapshot.data(), snapshot.id, planId, user.uid);
      if (!record) throw new Error('Stored Plan record failed validation.');
      return record;
    }).sort((left, right) => right.recordedAt.localeCompare(left.recordedAt) || right.recordId.localeCompare(left.recordId));
    const history: PlanHistoryEntry[] = [];
    completionsSnapshot.docs.forEach(snapshot => {
      const value = snapshot.data();
      if (value.ownerUid !== user.uid || value.workspaceId !== 'default' || value.planId !== planId || value.status !== 'completed') {
        throw new Error('Stored completion history failed validation.');
      }
      const recordedAt = toIso(value.completedAt) ?? (typeof value.completedDate === 'string' ? `${value.completedDate}T00:00:00.000Z` : null);
      if (!recordedAt || !Number.isInteger(value.durationMinutes)) throw new Error('Stored completion history failed validation.');
      history.push({
        id: `completion:${snapshot.id}`,
        kind: 'completion',
        title: 'Completed a Plan step',
        detail: `${value.durationMinutes} minutes recorded for ${value.completedDate}.`,
        recordedAt,
        sourceId: snapshot.id
      });
    });
    auditSnapshot.docs.forEach(snapshot => {
      const value = snapshot.data();
      if (value.ownerUid !== user.uid || value.workspaceId !== 'default' || value.planId !== planId || value.kind !== 'plan-working-days') return;
      const recordedAt = toIso(value.createdAt);
      const before = value.before?.workingDays;
      const after = value.after?.workingDays;
      if (!recordedAt || !Array.isArray(before) || !Array.isArray(after)) throw new Error('Stored approval history failed validation.');
      history.push({
        id: `approved-change:${snapshot.id}`,
        kind: 'approved-change',
        title: 'Approved a schedule change',
        detail: `${before.join(', ')} → ${after.join(', ')}.`,
        recordedAt,
        sourceId: snapshot.id
      });
    });
    return { records, history: newestFirst(history) };
  },

  async create(user, planId, recordId, draft) {
    if (!validPlanId(planId) || !validRecordId(recordId) || Object.keys(validatePlanRecordDraft(draft)).length > 0) {
      throw new Error('Plan record failed validation.');
    }
    const reference = recordRef(user.uid, planId, recordId);
    const fingerprint = planRecordFingerprint(draft);
    const duplicate = await runTransaction(db, async transaction => {
      const planSnapshot = await transaction.get(doc(db, root(user.uid), 'plans', planId));
      const existing = await transaction.get(reference);
      if (!planSnapshot.exists() || planSnapshot.data().ownerUid !== user.uid) throw new Error('Plan not found.');
      if (existing.exists()) {
        const stored = existing.data();
        if (stored.requestFingerprint !== fingerprint) throw new PlanRecordConflictError();
        if (!parsePlanRecord(stored, existing.id, planId, user.uid)) throw new Error('Stored Plan record failed validation.');
        return true;
      }
      transaction.set(reference, {
        ...draft,
        summary: draft.summary.trim(),
        rationale: draft.rationale.trim(),
        sourceFacts: draft.sourceFacts.map(fact => fact.trim()),
        recordId,
        planId,
        ownerUid: user.uid,
        workspaceId: 'default',
        requestFingerprint: fingerprint,
        schemaVersion: 1,
        recordedAt: serverTimestamp()
      });
      return false;
    });
    const snapshot = await getDoc(reference);
    const record = snapshot.exists() ? parsePlanRecord(snapshot.data(), snapshot.id, planId, user.uid) : null;
    if (!record) throw new Error('Saved Plan record could not be restored.');
    return { record, duplicate };
  }
};
