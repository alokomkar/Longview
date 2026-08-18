import type { AuthUser } from '../auth/types';
import type { TodayStep } from './deriveTodayStep';
import { completionFromStep, parseTodayCompletion, type TodayCompletion } from './types';

export type TodayOutboxFailure = 'offline' | 'unavailable';

export type TodayPendingCompletion = {
  key: string;
  schemaVersion: 1;
  ownerUid: string;
  completion: TodayCompletion;
  createdAtEpochMs: number;
  attemptCount: number;
  lastFailure: TodayOutboxFailure | null;
};

export interface TodayOutbox {
  get(user: AuthUser, step: TodayStep): Promise<TodayPendingCompletion | null>;
  put(user: AuthUser, step: TodayStep): Promise<TodayPendingCompletion>;
  recordFailure(user: AuthUser, step: TodayStep, failure: TodayOutboxFailure): Promise<TodayPendingCompletion>;
  remove(user: AuthUser, step: TodayStep): Promise<void>;
  clearOwner(ownerUid: string): Promise<void>;
}

export class TodayOutboxValidationError extends Error {
  constructor() {
    super('Pending completion failed validation.');
    this.name = 'TodayOutboxValidationError';
  }
}

export const todayOutboxKey = (ownerUid: string, completionId: string) => `${ownerUid}::${completionId}`;

export function pendingCompletionFromStep(user: AuthUser, step: TodayStep, createdAtEpochMs = Date.now()): TodayPendingCompletion {
  return {
    key: todayOutboxKey(user.uid, step.completionId),
    schemaVersion: 1,
    ownerUid: user.uid,
    completion: completionFromStep(user, step),
    createdAtEpochMs,
    attemptCount: 0,
    lastFailure: null
  };
}

export function parseTodayPendingCompletion(value: unknown, user: AuthUser, step: TodayStep): TodayPendingCompletion | null {
  if (typeof value !== 'object' || value === null) return null;
  const pending = value as Partial<TodayPendingCompletion>;
  const completion = parseTodayCompletion(pending.completion, step.completionId, user.uid, step);
  if (
    pending.key !== todayOutboxKey(user.uid, step.completionId) || pending.schemaVersion !== 1 ||
    pending.ownerUid !== user.uid || !completion ||
    typeof pending.createdAtEpochMs !== 'number' || !Number.isFinite(pending.createdAtEpochMs) || pending.createdAtEpochMs < 0 ||
    !Number.isInteger(pending.attemptCount) || (pending.attemptCount ?? -1) < 0 ||
    ![null, 'offline', 'unavailable'].includes(pending.lastFailure as TodayOutboxFailure | null)
  ) return null;
  return { ...pending, completion } as TodayPendingCompletion;
}
