import type { TodayOutbox, TodayOutboxFailure, TodayPendingCompletion } from './outbox';
import { parseTodayPendingCompletion, pendingCompletionFromStep, TodayOutboxValidationError, todayOutboxKey } from './outbox';

const databaseName = 'longview-today-outbox';
const storeName = 'todayCompletionOutbox';

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (!globalThis.indexedDB) {
    reject(new Error('Local storage is unavailable.'));
    return;
  }
  const request = globalThis.indexedDB.open(databaseName, 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(storeName)) {
      const store = database.createObjectStore(storeName, { keyPath: 'key' });
      store.createIndex('ownerUid', 'ownerUid', { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Local storage could not be opened.'));
  request.onblocked = () => reject(new Error('Local storage upgrade was blocked.'));
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error('Local storage transaction failed.'));
  transaction.onabort = () => reject(transaction.error ?? new Error('Local storage transaction was cancelled.'));
});

const requestValue = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Local storage request failed.'));
});

export const indexedDbTodayOutbox: TodayOutbox = {
  async get(user, step) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(storeName, 'readonly');
      const raw = await requestValue(transaction.objectStore(storeName).get(todayOutboxKey(user.uid, step.completionId)));
      await transactionDone(transaction);
      if (raw === undefined) return null;
      const pending = parseTodayPendingCompletion(raw, user, step);
      if (!pending) throw new TodayOutboxValidationError();
      return pending;
    } finally {
      database.close();
    }
  },

  async put(user, step) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const raw = await requestValue(store.get(todayOutboxKey(user.uid, step.completionId)));
      let pending: TodayPendingCompletion;
      if (raw !== undefined) {
        const existing = parseTodayPendingCompletion(raw, user, step);
        if (!existing) {
          transaction.abort();
          throw new TodayOutboxValidationError();
        }
        pending = existing;
      } else {
        pending = pendingCompletionFromStep(user, step);
        await requestValue(store.add(pending));
      }
      await transactionDone(transaction);
      return pending;
    } finally {
      database.close();
    }
  },

  async recordFailure(user, step, failure: TodayOutboxFailure) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const raw = await requestValue(store.get(todayOutboxKey(user.uid, step.completionId)));
      const existing = parseTodayPendingCompletion(raw, user, step);
      if (!existing) {
        transaction.abort();
        throw new TodayOutboxValidationError();
      }
      const pending: TodayPendingCompletion = {
        ...existing,
        attemptCount: existing.attemptCount + 1,
        lastFailure: failure
      };
      await requestValue(store.put(pending));
      await transactionDone(transaction);
      return pending;
    } finally {
      database.close();
    }
  },

  async remove(user, step) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(todayOutboxKey(user.uid, step.completionId));
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  },

  async clearOwner(ownerUid) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(storeName, 'readwrite');
      const index = transaction.objectStore(storeName).index('ownerUid');
      const request = index.openKeyCursor(IDBKeyRange.only(ownerUid));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        transaction.objectStore(storeName).delete(cursor.primaryKey);
        cursor.continue();
      };
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }
};
