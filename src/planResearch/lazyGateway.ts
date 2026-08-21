import type { PlanResearchSourceGateway } from './types';

export const lazyFirebasePlanResearchSourceGateway: PlanResearchSourceGateway = {
  async list(...args) {
    const { firebasePlanResearchSourceGateway } = await import('./firebaseGateway');
    return firebasePlanResearchSourceGateway.list(...args);
  },
  async save(...args) {
    const { firebasePlanResearchSourceGateway } = await import('./firebaseGateway');
    return firebasePlanResearchSourceGateway.save(...args);
  }
};
