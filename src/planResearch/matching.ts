import type { AuthUser } from '../auth/types';
import type { Plan } from '../plan/types';
import type { PlanResearchSourceDraft } from './types';

export type PlanMatchRequest = {
  schemaVersion: 1;
  requestId: string;
  source: Pick<PlanResearchSourceDraft, 'title' | 'excerpt' | 'note' | 'topic'>;
  plans: { id: string; title: string; outcome: string; why: string }[];
};
export type PlanMatchCandidate = {
  planId: string;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  rationale: string;
};
export type PlanMatchResponse = {
  schemaVersion: 1;
  requestId: string;
  requiresClarification: boolean;
  summary: string;
  candidates: PlanMatchCandidate[];
};
export interface PlanMatchGateway {
  match(user: AuthUser, request: PlanMatchRequest, signal: AbortSignal): Promise<unknown>;
}
export class PlanMatchTimeoutError extends Error {
  constructor() { super('Plan matching timed out.'); this.name = 'PlanMatchTimeoutError'; }
}

export const buildPlanMatchRequest = (requestId: string, draft: PlanResearchSourceDraft, plans: Plan[]): PlanMatchRequest => ({
  schemaVersion: 1,
  requestId,
  source: { title: draft.title.trim(), excerpt: draft.excerpt.trim(), note: draft.note.trim(), topic: draft.topic.trim() },
  plans: plans.filter(plan => plan.status === 'active').slice(0, 10).map(plan => ({ id: plan.id, title: plan.title, outcome: plan.outcome, why: plan.why }))
});

export function parsePlanMatchResponse(value: unknown, request: PlanMatchRequest): PlanMatchResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const response = value as Partial<PlanMatchResponse>;
  if (response.schemaVersion !== 1 || response.requestId !== request.requestId || typeof response.requiresClarification !== 'boolean' ||
      typeof response.summary !== 'string' || response.summary.trim().length < 10 || response.summary.length > 300 || !Array.isArray(response.candidates) || response.candidates.length > 3) return null;
  const planIds = new Set(request.plans.map(plan => plan.id));
  if (new Set(response.candidates.map(candidate => candidate?.planId)).size !== response.candidates.length || response.candidates.some(candidate =>
    !candidate || !planIds.has(candidate.planId) || !Number.isInteger(candidate.score) || candidate.score < 0 || candidate.score > 100 ||
    !['low', 'medium', 'high'].includes(candidate.confidence) || typeof candidate.rationale !== 'string' || candidate.rationale.trim().length < 10 || candidate.rationale.length > 300
  )) return null;
  return response as PlanMatchResponse;
}
