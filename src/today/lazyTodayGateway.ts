import type { TodayGateway } from './types';

export const lazyFirebaseTodayGateway: TodayGateway = {
  async get(user, step) {
    const { firebaseTodayGateway } = await import('./firebaseTodayGateway');
    return firebaseTodayGateway.get(user, step);
  },
  async complete(user, step) {
    const { firebaseTodayGateway } = await import('./firebaseTodayGateway');
    return firebaseTodayGateway.complete(user, step);
  }
};
