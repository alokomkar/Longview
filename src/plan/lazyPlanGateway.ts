import type { PlanGateway } from './types';

export const lazyFirebasePlanGateway: PlanGateway = {
  async create(user, draft) {
    const { firebasePlanGateway } = await import('./firebasePlanGateway');
    return firebasePlanGateway.create(user, draft);
  }
};
