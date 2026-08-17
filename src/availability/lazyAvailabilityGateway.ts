import type { AvailabilityGateway } from './types';

export const lazyFirebaseAvailabilityGateway: AvailabilityGateway = {
  async load(user) {
    const { firebaseAvailabilityGateway } = await import('./firebaseAvailabilityGateway');
    return firebaseAvailabilityGateway.load(user);
  },
  async save(user, draft, expectedVersion) {
    const { firebaseAvailabilityGateway } = await import('./firebaseAvailabilityGateway');
    return firebaseAvailabilityGateway.save(user, draft, expectedVersion);
  }
};
