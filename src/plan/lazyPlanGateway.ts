import type { PlanGateway } from './types';

export const lazyFirebasePlanGateway: PlanGateway = {
  async create(user, draft) {
    const { firebasePlanGateway } = await import('./firebasePlanGateway');
    return firebasePlanGateway.create(user, draft);
  },
  async list(user) {
    const { firebasePlanGateway } = await import('./firebasePlanGateway');
    return firebasePlanGateway.list(user);
  },
  async get(user, planId) {
    const { firebasePlanGateway } = await import('./firebasePlanGateway');
    return firebasePlanGateway.get(user, planId);
  },
  async updateSchedule(user, planId, draft, expectedVersion) {
    const { firebasePlanGateway } = await import('./firebasePlanGateway');
    return firebasePlanGateway.updateSchedule(user, planId, draft, expectedVersion);
  }
};
