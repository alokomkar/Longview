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
}

export type PlanErrors = Partial<Record<keyof Omit<PlanDraft, 'clientRequestId'>, string>>;

export function validatePlanDraft(draft: PlanDraft, today: string): PlanErrors {
  const errors: PlanErrors = {};
  const title = draft.title.trim();
  const outcome = draft.outcome.trim();
  const why = draft.why.trim();

  if (title.length < 3 || title.length > 80) errors.title = 'Use 3–80 characters.';
  if (outcome.length < 10 || outcome.length > 300) errors.outcome = 'Use 10–300 characters.';
  if (why.length < 10 || why.length > 300) errors.why = 'Use 10–300 characters.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.targetDate) || draft.targetDate < today) errors.targetDate = 'Choose today or a future date.';
  if (!Number.isInteger(draft.weeklyHours) || draft.weeklyHours < 1 || draft.weeklyHours > 40) errors.weeklyHours = 'Choose 1–40 hours.';
  return errors;
}
