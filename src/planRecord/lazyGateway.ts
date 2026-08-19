import type { PlanRecordGateway } from './types';

export const lazyFirebasePlanRecordGateway: PlanRecordGateway = {
  async load(...args) {
    const { firebasePlanRecordGateway } = await import('./firebaseGateway');
    return firebasePlanRecordGateway.load(...args);
  },
  async create(...args) {
    const { firebasePlanRecordGateway } = await import('./firebaseGateway');
    return firebasePlanRecordGateway.create(...args);
  }
};
