import type { Plan, WorkingDay } from '../plan/types';
import type { TodayStep } from '../today/deriveTodayStep';

export type ClaraContext = {
  schemaVersion: 1;
  requestId: string;
  scope: 'today-step';
  plan: Pick<Plan, 'id' | 'title' | 'outcome' | 'targetDate' | 'weeklyHours'> & {
    workingDays: WorkingDay[];
    scheduleVersion: number;
  };
  step: Pick<TodayStep, 'title' | 'description' | 'durationMinutes' | 'date'>;
};

export type ClaraPlanScheduleChange = {
  kind: 'plan-working-days';
  planId: string;
  expectedScheduleVersion: number;
  workingDaysBefore: WorkingDay[];
  workingDaysAfter: WorkingDay[];
  weeklyHours: number;
  rationale: string;
  downstreamEffect: string;
};

export type ClaraRecommendation = {
  schemaVersion: 1;
  requestId: string;
  sourcePlanId: string;
  headline: string;
  recommendation: string;
  rationale: string;
  confidence: 'low' | 'medium' | 'high';
  requiresClarification: boolean;
  sourceFacts: string[];
  proposedChange: ClaraPlanScheduleChange | null;
};

export interface ClaraGateway {
  recommend(context: ClaraContext, signal: AbortSignal): Promise<unknown>;
}

export class ClaraGatewayTimeoutError extends Error {
  constructor() {
    super('Clara request timed out');
    this.name = 'ClaraGatewayTimeoutError';
  }
}

export function buildClaraContext(plan: Plan, step: TodayStep, requestId: string): ClaraContext {
  if (!plan.workingDays?.length || !plan.scheduleVersion) {
    throw new Error('Clara requires a versioned Plan schedule.');
  }
  return {
    schemaVersion: 1,
    requestId,
    scope: 'today-step',
    plan: {
      id: plan.id,
      title: plan.title,
      outcome: plan.outcome,
      targetDate: plan.targetDate,
      weeklyHours: plan.weeklyHours,
      workingDays: plan.workingDays,
      scheduleVersion: plan.scheduleVersion
    },
    step: {
      title: step.title,
      description: step.description,
      durationMinutes: step.durationMinutes,
      date: step.date
    }
  };
}

const textInRange = (value: unknown, minimum: number, maximum: number): value is string =>
  typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum;

const isWorkingDayList = (value: unknown): value is WorkingDay[] =>
  Array.isArray(value) && value.length >= 1 && value.length <= 7 &&
  new Set(value).size === value.length &&
  value.every(day => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(String(day))) &&
  JSON.stringify(value) === JSON.stringify(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter(day => value.includes(day as WorkingDay)));

function parseScheduleChange(value: unknown, context: ClaraContext): ClaraPlanScheduleChange | null {
  if (typeof value !== 'object' || value === null) return null;
  const change = value as Partial<ClaraPlanScheduleChange>;
  if (
    change.kind !== 'plan-working-days' || change.planId !== context.plan.id ||
    change.expectedScheduleVersion !== context.plan.scheduleVersion ||
    change.weeklyHours !== context.plan.weeklyHours ||
    !isWorkingDayList(change.workingDaysBefore) || !isWorkingDayList(change.workingDaysAfter) ||
    JSON.stringify(change.workingDaysBefore) !== JSON.stringify(context.plan.workingDays) ||
    !textInRange(change.rationale, 10, 300) || !textInRange(change.downstreamEffect, 10, 300)
  ) return null;
  const before = change.workingDaysBefore;
  const after = change.workingDaysAfter;
  if (
    before.filter(day => !after.includes(day)).length +
      after.filter(day => !before.includes(day)).length !== 1
  ) return null;
  return change as ClaraPlanScheduleChange;
}

export function parseClaraRecommendation(value: unknown, context: ClaraContext): ClaraRecommendation | null {
  if (typeof value !== 'object' || value === null) return null;
  const result = value as Partial<ClaraRecommendation>;
  if (
    result.schemaVersion !== 1 || result.requestId !== context.requestId ||
    result.sourcePlanId !== context.plan.id || !textInRange(result.headline, 3, 100) ||
    !textInRange(result.recommendation, 10, 500) || !textInRange(result.rationale, 10, 500) ||
    !['low', 'medium', 'high'].includes(result.confidence ?? '') ||
    typeof result.requiresClarification !== 'boolean' ||
    !Array.isArray(result.sourceFacts) || result.sourceFacts.length < 1 || result.sourceFacts.length > 4 ||
    !result.sourceFacts.every(fact => textInRange(fact, 3, 120))
  ) return null;
  if (result.proposedChange !== null && !parseScheduleChange(result.proposedChange, context)) return null;
  return result as ClaraRecommendation;
}
