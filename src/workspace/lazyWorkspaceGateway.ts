import type { WorkspaceGateway } from './types';

export const lazyFirebaseWorkspaceGateway: WorkspaceGateway = {
  async ensure(user) {
    const { firebaseWorkspaceGateway } = await import('./firebaseWorkspaceGateway');
    return firebaseWorkspaceGateway.ensure(user);
  }
};
