import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firestore';
import type { WorkspaceGateway } from './types';

export const firebaseWorkspaceGateway: WorkspaceGateway = {
  async ensure(user) {
    const profileRef = doc(db, 'users', user.uid);
    const workspaceRef = doc(db, 'users', user.uid, 'workspaces', 'default');

    await runTransaction(db, async transaction => {
      const [profile, workspace] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(workspaceRef)
      ]);

      if (!profile.exists()) {
        transaction.set(profileRef, {
          uid: user.uid,
          displayName: user.displayName,
          authMode: user.isAnonymous ? 'anonymous' : 'google',
          schemaVersion: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.update(profileRef, {
          displayName: user.displayName,
          authMode: user.isAnonymous ? 'anonymous' : 'google',
          updatedAt: serverTimestamp()
        });
      }

      if (!workspace.exists()) {
        transaction.set(workspaceRef, {
          id: 'default',
          ownerUid: user.uid,
          schemaVersion: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    });

    return { id: 'default', ownerUid: user.uid, schemaVersion: 1 };
  }
};
