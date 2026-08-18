import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firestore';
import { completionFromStep, parseTodayCompletion, TodayCompletionValidationError, type TodayGateway } from './types';

const completionRef = (uid: string, id: string) =>
  doc(db, 'users', uid, 'workspaces', 'default', 'todayCompletions', id);

export const firebaseTodayGateway: TodayGateway = {
  async get(user, step) {
    const snapshot = await getDoc(completionRef(user.uid, step.completionId));
    if (!snapshot.exists()) return null;
    const completion = parseTodayCompletion(snapshot.data(), snapshot.id, user.uid, step);
    if (!completion) throw new TodayCompletionValidationError();
    return completion;
  },
  async complete(user, step) {
    const reference = completionRef(user.uid, step.completionId);
    return runTransaction(db, async transaction => {
      const existing = await transaction.get(reference);
      if (existing.exists()) {
        const completion = parseTodayCompletion(existing.data(), existing.id, user.uid, step);
        if (!completion) throw new TodayCompletionValidationError();
        return { completion, duplicate: true };
      }
      const completion = completionFromStep(user, step);
      transaction.set(reference, { ...completion, completedAt: serverTimestamp() });
      return { completion, duplicate: false };
    });
  }
};
