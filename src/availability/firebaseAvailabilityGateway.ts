import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firestore';
import {
  AvailabilityConflictError,
  parseStoredAvailability,
  validateAvailabilityDraft,
  type AvailabilityGateway
} from './types';

export const firebaseAvailabilityGateway: AvailabilityGateway = {
  async load(user) {
    const workspace = await getDoc(doc(db, 'users', user.uid, 'workspaces', 'default'));
    if (!workspace.exists() || workspace.data().availability == null) return null;
    const parsed = parseStoredAvailability(workspace.data().availability);
    if (!parsed) throw new Error('Stored availability is malformed.');
    return parsed;
  },

  async save(user, draft, expectedVersion) {
    if (Object.keys(validateAvailabilityDraft(draft)).length > 0) throw new Error('Availability is invalid.');
    const workspaceRef = doc(db, 'users', user.uid, 'workspaces', 'default');
    return runTransaction(db, async transaction => {
      const workspace = await transaction.get(workspaceRef);
      if (!workspace.exists()) throw new Error('Workspace is missing.');
      const storedVersion = Number.isInteger(workspace.data().availabilityVersion)
        ? workspace.data().availabilityVersion as number
        : 0;
      if (storedVersion !== expectedVersion) throw new AvailabilityConflictError();
      const availability = { ...draft, schemaVersion: 1 as const, version: storedVersion + 1 };
      transaction.update(workspaceRef, {
        availability,
        availabilityVersion: availability.version,
        updatedAt: serverTimestamp()
      });
      return availability;
    });
  }
};
