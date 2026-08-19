import type { PlanMemoryGateway } from './types';

export const lazyFirebasePlanMemoryGateway: PlanMemoryGateway = {
  async loadResearch(...args) {
    const { firebasePlanMemoryGateway } = await import('./firebaseGateway');
    return firebasePlanMemoryGateway.loadResearch(...args);
  },
  async loadBrief(...args) {
    const { firebasePlanMemoryGateway } = await import('./firebaseGateway');
    return firebasePlanMemoryGateway.loadBrief(...args);
  },
  async reviewResearch(...args) {
    const { firebasePlanMemoryGateway } = await import('./firebaseGateway');
    return firebasePlanMemoryGateway.reviewResearch(...args);
  },
  async saveBrief(...args) {
    const { firebasePlanMemoryGateway } = await import('./firebaseGateway');
    return firebasePlanMemoryGateway.saveBrief(...args);
  }
};
