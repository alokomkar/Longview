import type { PlanMatchGateway } from './matching';

export const lazyPlanMatchGateway: PlanMatchGateway = {
  async match(...args) {
    const { managedPlanMatchGateway } = await import('./managedMatchGateway');
    return managedPlanMatchGateway.match(...args);
  }
};
