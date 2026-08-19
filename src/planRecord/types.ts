import type { AuthUser } from '../auth/types';
import type { ClaraRecommendation } from '../clara/types';

export type PlanRecordKind = 'decision' | 'clara-guidance';
export type PlanRecordConfidence = ClaraRecommendation['confidence'];

export type PlanRecordDraft = {
  kind: PlanRecordKind;
  summary: string;
  rationale: string;
  confidence: PlanRecordConfidence | null;
  sourceFacts: string[];
  sourceRecommendationId: string | null;
};

export type PlanRecord = PlanRecordDraft & {
  recordId: string;
  planId: string;
  ownerUid: string;
  workspaceId: 'default';
  requestFingerprint: string;
  schemaVersion: 1;
  recordedAt: string;
};

export type PlanHistoryEntry = {
  id: string;
  kind: 'completion' | 'approved-change';
  title: string;
  detail: string;
  recordedAt: string;
  sourceId: string;
};

export type PlanRecordBundle = {
  records: PlanRecord[];
  history: PlanHistoryEntry[];
};

export type PlanRecordResult = { record: PlanRecord; duplicate: boolean };

export interface PlanRecordGateway {
  load(user: AuthUser, planId: string): Promise<PlanRecordBundle>;
  create(user: AuthUser, planId: string, recordId: string, draft: PlanRecordDraft): Promise<PlanRecordResult>;
}

export class PlanRecordConflictError extends Error {
  constructor() {
    super('This record key was already used for different content.');
    this.name = 'PlanRecordConflictError';
  }
}

const textInRange = (value: unknown, minimum: number, maximum: number): value is string =>
  typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum;

export function validatePlanRecordDraft(draft: PlanRecordDraft): Partial<Record<'summary' | 'rationale' | 'sourceFacts', string>> {
  const errors: Partial<Record<'summary' | 'rationale' | 'sourceFacts', string>> = {};
  if (!textInRange(draft.summary, 3, 500)) errors.summary = 'Use 3–500 characters.';
  if (!textInRange(draft.rationale, 10, 500)) errors.rationale = 'Use 10–500 characters.';
  if (draft.kind === 'decision') {
    if (draft.confidence !== null || draft.sourceFacts.length !== 0 || draft.sourceRecommendationId !== null) {
      errors.sourceFacts = 'Decision records cannot include recommendation metadata.';
    }
  } else if (
    !['low', 'medium', 'high'].includes(draft.confidence ?? '') ||
    !textInRange(draft.sourceRecommendationId, 8, 128) ||
    draft.sourceFacts.length < 1 || draft.sourceFacts.length > 4 ||
    !draft.sourceFacts.every(fact => textInRange(fact, 3, 120))
  ) {
    errors.sourceFacts = 'Guidance must retain its confidence, source and 1–4 context facts.';
  }
  return errors;
}

export function planRecordFingerprint(draft: PlanRecordDraft): string {
  return JSON.stringify([
    1,
    draft.kind,
    draft.summary.trim(),
    draft.rationale.trim(),
    draft.confidence,
    draft.sourceFacts.map(fact => fact.trim()),
    draft.sourceRecommendationId
  ]);
}

export function draftFromRecommendation(recommendation: ClaraRecommendation): PlanRecordDraft {
  return {
    kind: 'clara-guidance',
    summary: recommendation.recommendation.trim(),
    rationale: recommendation.rationale.trim(),
    confidence: recommendation.confidence,
    sourceFacts: recommendation.sourceFacts.map(fact => fact.trim()),
    sourceRecommendationId: recommendation.requestId
  };
}

export function parsePlanRecord(value: unknown, recordId: string, planId: string, ownerUid: string): PlanRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Partial<PlanRecord> & { recordedAt?: unknown };
  const draft: PlanRecordDraft = {
    kind: record.kind as PlanRecordKind,
    summary: record.summary ?? '',
    rationale: record.rationale ?? '',
    confidence: record.confidence ?? null,
    sourceFacts: record.sourceFacts ?? [],
    sourceRecommendationId: record.sourceRecommendationId ?? null
  };
  const recordedAt = toIso(record.recordedAt);
  if (
    record.recordId !== recordId || record.planId !== planId || record.ownerUid !== ownerUid ||
    record.workspaceId !== 'default' || record.schemaVersion !== 1 || !recordedAt ||
    typeof record.requestFingerprint !== 'string' || record.requestFingerprint !== planRecordFingerprint(draft) ||
    Object.keys(validatePlanRecordDraft(draft)).length > 0
  ) return null;
  return { ...record, ...draft, recordedAt } as PlanRecord;
}

export function toIso(value: unknown): string | null {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null;
  }
  return null;
}

export const newestFirst = <T extends { recordedAt: string; id: string }>(values: T[]) =>
  [...values].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt) || right.id.localeCompare(left.id));
