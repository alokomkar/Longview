import type { PlanResearchSourceGateway } from './types';

export const lazyFirebasePlanResearchSourceGateway: PlanResearchSourceGateway = {
  async list(...args) {
    const { firebasePlanResearchSourceGateway } = await import('./firebaseGateway');
    return firebasePlanResearchSourceGateway.list(...args);
  },
  async save(...args) {
    const { firebasePlanResearchSourceGateway } = await import('./firebaseGateway');
    return firebasePlanResearchSourceGateway.save(...args);
  },
  async update(...args) {
    const { firebasePlanResearchSourceGateway } = await import('./firebaseGateway');
    return firebasePlanResearchSourceGateway.update(...args);
  },
  async loadWiki(...args) {
    const { firebasePlanResearchSourceGateway } = await import('./firebaseGateway');
    return firebasePlanResearchSourceGateway.loadWiki(...args);
  },
  async saveWiki(...args) {
    const { firebasePlanResearchSourceGateway } = await import('./firebaseGateway');
    return firebasePlanResearchSourceGateway.saveWiki(...args);
  },
  async promoteWiki(...args) {
    const { firebasePlanResearchSourceGateway } = await import('./firebaseGateway');
    return firebasePlanResearchSourceGateway.promoteWiki(...args);
  }
};
