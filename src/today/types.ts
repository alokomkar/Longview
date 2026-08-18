import type { AuthUser } from '../auth/types';
import type { TodayStep } from './deriveTodayStep';

export type TodayCompletion = {
  id: string;
  ownerUid: string;
  workspaceId: 'default';
  planId: string;
  stepKey: 'first-proof-v1';
  completedDate: string;
  durationMinutes: number;
  status: 'completed';
  schemaVersion: 1;
};

export type TodayCompletionResult = {
  completion: TodayCompletion;
  duplicate: boolean;
};

export interface TodayGateway {
  get(user: AuthUser, step: TodayStep): Promise<TodayCompletion | null>;
  complete(user: AuthUser, step: TodayStep): Promise<TodayCompletionResult>;
}

export function completionFromStep(user: AuthUser, step: TodayStep): TodayCompletion {
  return {
    id: step.completionId,
    ownerUid: user.uid,
    workspaceId: 'default',
    planId: step.planId,
    stepKey: 'first-proof-v1',
    completedDate: step.date,
    durationMinutes: step.durationMinutes,
    status: 'completed',
    schemaVersion: 1
  };
}

const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

export function parseTodayCompletion(value: unknown, documentId: string, ownerUid: string, step?: TodayStep): TodayCompletion | null {
  if (typeof value !== 'object' || value === null) return null;
  const completion = value as Partial<TodayCompletion>;
  if (
    completion.id !== documentId || completion.ownerUid !== ownerUid || completion.workspaceId !== 'default' ||
    typeof completion.planId !== 'string' || completion.planId.length === 0 || completion.stepKey !== 'first-proof-v1' ||
    typeof completion.completedDate !== 'string' || !isCalendarDate(completion.completedDate) ||
    !Number.isInteger(completion.durationMinutes) || (completion.durationMinutes ?? 0) < 30 || (completion.durationMinutes ?? 0) > 60 ||
    completion.status !== 'completed' || completion.schemaVersion !== 1
  ) return null;
  if (step && (
    completion.id !== step.completionId || completion.planId !== step.planId ||
    completion.completedDate !== step.date || completion.durationMinutes !== step.durationMinutes
  )) return null;
  return completion as TodayCompletion;
}
