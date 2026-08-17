import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firestore';
import type { Plan, PlanGateway } from './types';

export const firebasePlanGateway: PlanGateway = {
  async create(user, draft) {
    const planRef = doc(db, 'users', user.uid, 'workspaces', 'default', 'plans', draft.clientRequestId);
    return runTransaction(db, async transaction => {
      const existing = await transaction.get(planRef);
      if (existing.exists()) return existing.data() as Plan;

      const plan: Plan = {
        ...draft,
        title: draft.title.trim(),
        outcome: draft.outcome.trim(),
        why: draft.why.trim(),
        id: draft.clientRequestId,
        ownerUid: user.uid,
        workspaceId: 'default',
        status: 'active',
        schemaVersion: 1
      };
      transaction.set(planRef, { ...plan, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return plan;
    });
  }
};
