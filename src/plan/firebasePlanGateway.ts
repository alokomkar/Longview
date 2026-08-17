import { collection, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firestore';
import { orderWorkingDays, parseStoredPlan, PlanScheduleConflictError, type Plan, type PlanGateway } from './types';

export const firebasePlanGateway: PlanGateway = {
  async create(user, draft) {
    const planRef = doc(db, 'users', user.uid, 'workspaces', 'default', 'plans', draft.clientRequestId);
    return runTransaction(db, async transaction => {
      const existing = await transaction.get(planRef);
      if (existing.exists()) return existing.data() as Plan;

      const plan: Plan = {
        ...draft,
        workingDays: orderWorkingDays(draft.workingDays),
        title: draft.title.trim(),
        outcome: draft.outcome.trim(),
        why: draft.why.trim(),
        id: draft.clientRequestId,
        ownerUid: user.uid,
        workspaceId: 'default',
        status: 'active',
        schemaVersion: 2,
        scheduleVersion: 1
      };
      transaction.set(planRef, { ...plan, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return plan;
    });
  },
  async list(user) {
    const plans = collection(db, 'users', user.uid, 'workspaces', 'default', 'plans');
    const snapshot = await getDocs(query(plans, orderBy('createdAt', 'desc')));
    return snapshot.docs.map(document => {
      const plan = parseStoredPlan(document.data(), document.id, user.uid);
      if (!plan) throw new Error('Stored Plan failed validation.');
      return plan;
    });
  },
  async get(user, planId) {
    const planRef = doc(db, 'users', user.uid, 'workspaces', 'default', 'plans', planId);
    const snapshot = await getDoc(planRef);
    if (!snapshot.exists()) return null;
    const plan = parseStoredPlan(snapshot.data(), snapshot.id, user.uid);
    if (!plan) throw new Error('Stored Plan failed validation.');
    return plan;
  },
  async updateSchedule(user, planId, draft, expectedVersion) {
    const planRef = doc(db, 'users', user.uid, 'workspaces', 'default', 'plans', planId);
    return runTransaction(db, async transaction => {
      const snapshot = await transaction.get(planRef);
      const current = snapshot.exists() ? parseStoredPlan(snapshot.data(), snapshot.id, user.uid) : null;
      if (!current) throw new Error('Plan not found or malformed.');
      if (current.scheduleVersion !== expectedVersion) throw new PlanScheduleConflictError('Plan schedule changed.');
      const updated: Plan = {
        ...current,
        workingDays: orderWorkingDays(draft.workingDays),
        weeklyHours: draft.weeklyHours,
        schemaVersion: 2,
        scheduleVersion: expectedVersion + 1
      };
      transaction.update(planRef, {
        workingDays: updated.workingDays,
        weeklyHours: updated.weeklyHours,
        schemaVersion: updated.schemaVersion,
        scheduleVersion: updated.scheduleVersion,
        updatedAt: serverTimestamp()
      });
      return updated;
    });
  }
};
