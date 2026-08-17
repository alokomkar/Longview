import type { AuthUser } from '../auth/types';

export type PlanDraft = {
  clientRequestId: string;
  title: string;
  outcome: string;
  why: string;
  targetDate: string;
  weeklyHours: number;
};

export type Plan = PlanDraft & {
  id: string;
  ownerUid: string;
  workspaceId: 'default';
  status: 'active';
  schemaVersion: 1;
};

export interface PlanGateway {
  create(user: AuthUser, draft: PlanDraft): Promise<Plan>;
  list(user: AuthUser): Promise<Plan[]>;
}

export type PlanErrors = Partial<Record<keyof Omit<PlanDraft, 'clientRequestId'>, string>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

export function parseStoredPlan(value: unknown, documentId: string, ownerUid: string): Plan | null {
  if (!isRecord(value)) return null;
  const plan = value as Partial<Plan>;
  if (
    plan.id !== documentId || plan.clientRequestId !== documentId || plan.ownerUid !== ownerUid ||
    plan.workspaceId !== 'default' || plan.status !== 'active' || plan.schemaVersion !== 1 ||
    typeof plan.title !== 'string' || plan.title.length < 3 || plan.title.length > 80 ||
    typeof plan.outcome !== 'string' || plan.outcome.length < 10 || plan.outcome.length > 300 ||
    typeof plan.why !== 'string' || plan.why.length < 10 || plan.why.length > 300 ||
    typeof plan.targetDate !== 'string' || !isCalendarDate(plan.targetDate) ||
    !Number.isInteger(plan.weeklyHours) || (plan.weeklyHours ?? 0) < 1 || (plan.weeklyHours ?? 0) > 40
  ) return null;
  return plan as Plan;
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
  if (!Number.isInteger(draft.weeklyHours) || draft.weeklyHours < 1 || draft.weeklyHours > 40) errors.weeklyHours = 'Choose 1–40 hours.';
  return errors;
}
