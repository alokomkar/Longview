import type { TodayOutbox } from './outbox';

export const lazyIndexedDbTodayOutbox: TodayOutbox = {
  async get(user, step) {
    const { indexedDbTodayOutbox } = await import('./indexedDbTodayOutbox');
    return indexedDbTodayOutbox.get(user, step);
  },
  async put(user, step) {
    const { indexedDbTodayOutbox } = await import('./indexedDbTodayOutbox');
    return indexedDbTodayOutbox.put(user, step);
  },
  async recordFailure(user, step, failure) {
    const { indexedDbTodayOutbox } = await import('./indexedDbTodayOutbox');
    return indexedDbTodayOutbox.recordFailure(user, step, failure);
  },
  async remove(user, step) {
    const { indexedDbTodayOutbox } = await import('./indexedDbTodayOutbox');
    return indexedDbTodayOutbox.remove(user, step);
  },
  async clearOwner(ownerUid) {
    const { indexedDbTodayOutbox } = await import('./indexedDbTodayOutbox');
    return indexedDbTodayOutbox.clearOwner(ownerUid);
  }
};
