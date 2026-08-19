import type { AuthUser } from '../auth/types';

export const workingDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WorkingDay = typeof workingDays[number];
export const orderWorkingDays = (days: readonly WorkingDay[]) =>
  workingDays.filter(day => days.includes(day));

export type PlanDraft = {
  clientRequestId: string;
  title: string;
  outcome: string;
  why: string;
  targetDate: string;
  weeklyHours: number;
  workingDays: WorkingDay[];
};

export type Plan = Omit<PlanDraft, 'workingDays'> & {
  workingDays?: WorkingDay[] | null;
  id: string;
  ownerUid: string;
  workspaceId: 'default';
  status: 'active' | 'completed';
  schemaVersion: 1 | 2 | 3;
  scheduleVersion?: number;
  achievementId?: string | null;
  completedAt?: string | null;
  completionVersion?: number;
};

export type PlanScheduleDraft = Pick<PlanDraft, 'workingDays' | 'weeklyHours'>;

export interface PlanGateway {
  create(user: AuthUser, draft: PlanDraft): Promise<Plan>;
  list(user: AuthUser): Promise<Plan[]>;
  get(user: AuthUser, planId: string): Promise<Plan | null>;
  updateSchedule(user: AuthUser, planId: string, draft: PlanScheduleDraft, expectedVersion: number): Promise<Plan>;
}

export type PlanErrors = Partial<Record<keyof Omit<PlanDraft, 'clientRequestId'>, string>>;
export type PlanScheduleErrors = Partial<Record<keyof PlanScheduleDraft, string>>;

export class PlanScheduleConflictError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

const toIso = (value: unknown): string | null => {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  if (isRecord(value) && typeof value.toDate === 'function') {
    const date = (value.toDate as () => Date)();
    return !Number.isNaN(date.valueOf()) ? date.toISOString() : null;
  }
  return null;
};

export function parseStoredPlan(value: unknown, documentId: string, ownerUid: string): Plan | null {
  if (!isRecord(value)) return null;
  const plan = value as Partial<Plan>;
  if (
    plan.id !== documentId || plan.clientRequestId !== documentId || plan.ownerUid !== ownerUid ||
    plan.workspaceId !== 'default' || !['active', 'completed'].includes(String(plan.status)) || ![1, 2, 3].includes(plan.schemaVersion ?? 0) ||
    typeof plan.title !== 'string' || plan.title.length < 3 || plan.title.length > 80 ||
    typeof plan.outcome !== 'string' || plan.outcome.length < 10 || plan.outcome.length > 300 ||
    typeof plan.why !== 'string' || plan.why.length < 10 || plan.why.length > 300 ||
    typeof plan.targetDate !== 'string' || !isCalendarDate(plan.targetDate) ||
    !Number.isInteger(plan.weeklyHours) || (plan.weeklyHours ?? 0) < 1 || (plan.weeklyHours ?? 0) > 40
  ) return null;
  if (plan.status === 'active' && ![1, 2].includes(plan.schemaVersion ?? 0)) return null;
  const completedAt = plan.status === 'completed' ? toIso(plan.completedAt) : null;
  if (plan.status === 'completed' && (
    plan.schemaVersion !== 3 || typeof plan.achievementId !== 'string' ||
    plan.achievementId.length < 8 || plan.achievementId.length > 128 || plan.achievementId.includes('/') ||
    !completedAt || plan.completionVersion !== 1
  )) return null;
  const scheduleVersion = plan.schemaVersion === 1 ? 0 : plan.scheduleVersion;
  const storedDays = plan.schemaVersion === 1 ? null : plan.workingDays;
  if (plan.schemaVersion !== 1 && (
    !Number.isInteger(scheduleVersion) || (scheduleVersion ?? 0) < 1 ||
    !Array.isArray(storedDays) || Object.keys(validatePlanSchedule({ workingDays: storedDays as WorkingDay[], weeklyHours: plan.weeklyHours as number })).length > 0
  )) return null;
  return {
    ...plan,
    workingDays: storedDays as WorkingDay[] | null,
    scheduleVersion: scheduleVersion as number,
    achievementId: plan.status === 'completed' ? plan.achievementId : null,
    completedAt,
    completionVersion: plan.status === 'completed' ? 1 : undefined
  } as Plan;
}

export function validatePlanSchedule(draft: PlanScheduleDraft): PlanScheduleErrors {
  const errors: PlanScheduleErrors = {};
  const uniqueDays = new Set(draft.workingDays);
  if (draft.workingDays.length < 1 || uniqueDays.size !== draft.workingDays.length ||
      draft.workingDays.some(day => !workingDays.includes(day))) {
    errors.workingDays = 'Choose at least one working day.';
  }
  if (!Number.isInteger(draft.weeklyHours) || draft.weeklyHours < 1 || draft.weeklyHours > 40) {
    errors.weeklyHours = 'Choose 1–40 hours.';
  }
  return errors;
}

export function validatePlanDraft(draft: PlanDraft, today: string): PlanErrors {
  const errors: PlanErrors = {};
  const title = draft.title.trim();
  const outcome = draft.outcome.trim();
  const why = draft.why.trim();

  if (title.length < 3 || title.length > 80) errors.title = 'Use 3–80 characters.';
  if (outcome.length < 10 || outcome.length > 300) errors.outcome = 'Use 10–300 characters.';
  if (why.length < 10 || why.length > 300) errors.why = 'Use 10–300 characters.';
  if (!isCalendarDate(draft.targetDate) || draft.targetDate < today) errors.targetDate = 'Choose today or a future date.';
  Object.assign(errors, validatePlanSchedule(draft));
  return errors;
}
