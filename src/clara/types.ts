import type { Plan } from '../plan/types';
import type { TodayStep } from '../today/deriveTodayStep';

export type ClaraContext = {
  schemaVersion: 1;
  requestId: string;
  scope: 'today-step';
  plan: Pick<Plan, 'id' | 'title' | 'outcome' | 'targetDate' | 'weeklyHours'>;
  step: Pick<TodayStep, 'title' | 'description' | 'durationMinutes' | 'date'>;
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
  proposedChange: null;
};

export interface ClaraGateway {
  recommend(context: ClaraContext, signal: AbortSignal): Promise<unknown>;
}

export function buildClaraContext(plan: Plan, step: TodayStep, requestId: string): ClaraContext {
  return {
    schemaVersion: 1,
    requestId,
    scope: 'today-step',
    plan: {
      id: plan.id,
      title: plan.title,
      outcome: plan.outcome,
      targetDate: plan.targetDate,
      weeklyHours: plan.weeklyHours
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

export function parseClaraRecommendation(value: unknown, context: ClaraContext): ClaraRecommendation | null {
  if (typeof value !== 'object' || value === null) return null;
  const result = value as Partial<ClaraRecommendation>;
  if (
    result.schemaVersion !== 1 || result.requestId !== context.requestId ||
    result.sourcePlanId !== context.plan.id || !textInRange(result.headline, 3, 100) ||
    !textInRange(result.recommendation, 10, 500) || !textInRange(result.rationale, 10, 500) ||
    !['low', 'medium', 'high'].includes(result.confidence ?? '') ||
    typeof result.requiresClarification !== 'boolean' || result.proposedChange !== null ||
    !Array.isArray(result.sourceFacts) || result.sourceFacts.length < 1 || result.sourceFacts.length > 4 ||
    !result.sourceFacts.every(fact => textInRange(fact, 3, 120))
  ) return null;
  return result as ClaraRecommendation;
}
