import type { AuthUser } from '../auth/types';
import type { Plan } from '../plan/types';
import { toIso } from '../planRecord/types';

export const reflectionFieldIds = ['whatWorked', 'whatChanged', 'doDifferently'] as const;
export type ReflectionFieldId = typeof reflectionFieldIds[number];

export type AchievementEvidence = {
  label: string;
  url: string | null;
};

export type ReflectionDraft = Record<ReflectionFieldId, string>;

export type AchievementDraft = {
  outcome: string;
  evidence: AchievementEvidence[];
  reflection: ReflectionDraft;
  approvedReflectionFields: ReflectionFieldId[];
};

export type AchievementRecord = {
  schemaVersion: 1;
  achievementId: string;
  planId: string;
  ownerUid: string;
  workspaceId: 'default';
  outcome: string;
  evidence: AchievementEvidence[];
  completedStepIds: string[];
  expectedPlanRevision: number;
  reflectionId: string | null;
  requestFingerprint: string;
  recordedAt: string;
};

export type ReflectionRecord = ReflectionDraft & {
  schemaVersion: 1;
  reflectionId: string;
  achievementId: string;
  planId: string;
  ownerUid: string;
  workspaceId: 'default';
  recordedAt: string;
};

export type ReuseConsent = {
  schemaVersion: 1;
  consentId: string;
  achievementId: string;
  reflectionId: string | null;
  planId: string;
  ownerUid: string;
  workspaceId: 'default';
  purpose: 'future_plan_guidance';
  approvedReflectionFields: ReflectionFieldId[];
  version: number;
  previousConsentId: string | null;
  requestFingerprint: string;
  recordedAt: string;
};

export type AchievementBundle = {
  completedStepIds: string[];
  requiredStepIds: ['first-proof-v1'];
  eligible: boolean;
  achievement: AchievementRecord | null;
  reflection: ReflectionRecord | null;
  consent: ReuseConsent | null;
  consentVersion: number;
};

export type FinishAchievementRequest = {
  achievementId: string;
  reflectionId: string;
  consentId: string;
  expectedPlanRevision: number;
  completedStepIds: string[];
  draft: AchievementDraft;
};

export type RevokeReuseRequest = {
  consentId: string;
  expectedConsentVersion: number;
};

export type FinishAchievementResult = {
  bundle: AchievementBundle;
  plan: Plan;
  duplicate: boolean;
};

export type RevokeReuseResult = {
  consent: ReuseConsent;
  duplicate: boolean;
};

export interface AchievementGateway {
  load(user: AuthUser, planId: string): Promise<AchievementBundle>;
  finish(user: AuthUser, planId: string, request: FinishAchievementRequest): Promise<FinishAchievementResult>;
  revokeReuse(user: AuthUser, planId: string, request: RevokeReuseRequest): Promise<RevokeReuseResult>;
}

export class AchievementConflictError extends Error {
  constructor(message = 'This Plan changed before it could be finished.') { super(message); this.name = 'AchievementConflictError'; }
}

export class AchievementIdempotencyConflictError extends Error {
  constructor() { super('This request key was reused with different content.'); this.name = 'AchievementIdempotencyConflictError'; }
}

export class AchievementValidationError extends Error {
  constructor(message = 'Achievement data failed validation.') { super(message); this.name = 'AchievementValidationError'; }
}

export class ReuseConsentConflictError extends Error {
  constructor() { super('Reuse permission changed.'); this.name = 'ReuseConsentConflictError'; }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textInRange = (value: unknown, minimum: number, maximum: number): value is string =>
  typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum;
export const validAchievementId = (value: unknown): value is string =>
  textInRange(value, 8, 128) && !value.includes('/');

export function validateEvidence(value: unknown): value is AchievementEvidence {
  if (!isRecord(value) || !textInRange(value.label, 3, 160)) return false;
  return value.url === null || (typeof value.url === 'string' && value.url.length <= 1000 && /^https:\/\/[^\s]+$/i.test(value.url));
}

export function normalizeAchievementDraft(draft: AchievementDraft): AchievementDraft {
  const reflection = Object.fromEntries(reflectionFieldIds.map(field => [field, draft.reflection[field].trim()])) as ReflectionDraft;
  return {
    outcome: draft.outcome.trim(),
    evidence: draft.evidence.map(item => ({ label: item.label.trim(), url: item.url?.trim() || null })),
    reflection,
    approvedReflectionFields: reflectionFieldIds.filter(field =>
      draft.approvedReflectionFields.includes(field) && reflection[field].length > 0
    )
  };
}

export function validateAchievementDraft(draft: AchievementDraft): Partial<Record<'outcome' | 'evidence' | 'reflection' | 'approvedReflectionFields', string>> {
  const normalized = normalizeAchievementDraft(draft);
  const errors: Partial<Record<'outcome' | 'evidence' | 'reflection' | 'approvedReflectionFields', string>> = {};
  if (!textInRange(normalized.outcome, 10, 600)) errors.outcome = 'Use 10–600 characters.';
  if (normalized.evidence.length < 1 || normalized.evidence.length > 3 || !normalized.evidence.every(validateEvidence)) {
    errors.evidence = 'Add 1–3 evidence labels. Links must use https:// or remain blank.';
  }
  if (reflectionFieldIds.some(field => normalized.reflection[field].length > 1000)) {
    errors.reflection = 'Keep each reflection statement within 1000 characters.';
  }
  if (new Set(normalized.approvedReflectionFields).size !== normalized.approvedReflectionFields.length ||
      normalized.approvedReflectionFields.some(field => !reflectionFieldIds.includes(field) || !normalized.reflection[field])) {
    errors.approvedReflectionFields = 'Approve only non-empty reflection statements.';
  }
  return errors;
}

export function achievementFingerprint(request: FinishAchievementRequest): string {
  const draft = normalizeAchievementDraft(request.draft);
  return JSON.stringify([1, request.expectedPlanRevision, [...request.completedStepIds].sort(), draft]);
}

export function reuseConsentFingerprint(achievementId: string, reflectionId: string | null, approvedFields: ReflectionFieldId[], version: number, previousConsentId: string | null): string {
  return JSON.stringify([1, achievementId, reflectionId, reflectionFieldIds.filter(field => approvedFields.includes(field)), version, previousConsentId]);
}

export function parseAchievementRecord(value: unknown, id: string, planId: string, ownerUid: string): AchievementRecord | null {
  if (!isRecord(value)) return null;
  const recordedAt = toIso(value.recordedAt);
  const evidence = Array.isArray(value.evidence) ? value.evidence : [];
  const completedStepIds = Array.isArray(value.completedStepIds) ? value.completedStepIds : [];
  if (!recordedAt || value.schemaVersion !== 1 || value.achievementId !== id || value.planId !== planId ||
      value.ownerUid !== ownerUid || value.workspaceId !== 'default' || !textInRange(value.outcome, 10, 600) ||
      evidence.length < 1 || evidence.length > 3 || !evidence.every(validateEvidence) ||
      completedStepIds.length < 1 || completedStepIds.length > 20 || new Set(completedStepIds).size !== completedStepIds.length ||
      !completedStepIds.every(validAchievementId) || !Number.isInteger(value.expectedPlanRevision) || Number(value.expectedPlanRevision) < 1 ||
      (value.reflectionId !== null && !validAchievementId(value.reflectionId)) || !textInRange(value.requestFingerprint, 1, 10000)) return null;
  return { ...value, evidence, completedStepIds, recordedAt } as AchievementRecord;
}

export function parseReflectionRecord(value: unknown, id: string, achievementId: string, planId: string, ownerUid: string): ReflectionRecord | null {
  if (!isRecord(value)) return null;
  const recordedAt = toIso(value.recordedAt);
  if (!recordedAt || value.schemaVersion !== 1 || value.reflectionId !== id || value.achievementId !== achievementId ||
      value.planId !== planId || value.ownerUid !== ownerUid || value.workspaceId !== 'default' ||
      reflectionFieldIds.some(field => typeof value[field] !== 'string' || String(value[field]).length > 1000) ||
      !reflectionFieldIds.some(field => String(value[field]).trim().length > 0)) return null;
  return { ...value, recordedAt } as ReflectionRecord;
}

export function parseReuseConsent(value: unknown, id: string, achievementId: string, planId: string, ownerUid: string): ReuseConsent | null {
  if (!isRecord(value)) return null;
  const recordedAt = toIso(value.recordedAt);
  const approved = Array.isArray(value.approvedReflectionFields) ? value.approvedReflectionFields : [];
  if (!recordedAt || value.schemaVersion !== 1 || value.consentId !== id || value.achievementId !== achievementId ||
      value.planId !== planId || value.ownerUid !== ownerUid || value.workspaceId !== 'default' ||
      value.purpose !== 'future_plan_guidance' || approved.length > 3 || new Set(approved).size !== approved.length ||
      !approved.every(field => reflectionFieldIds.includes(field as ReflectionFieldId)) ||
      (approved.length > 0 && !validAchievementId(value.reflectionId)) ||
      (approved.length === 0 && value.reflectionId !== null && !validAchievementId(value.reflectionId)) ||
      !Number.isInteger(value.version) || Number(value.version) < 1 ||
      (value.previousConsentId !== null && !validAchievementId(value.previousConsentId)) ||
      !textInRange(value.requestFingerprint, 1, 5000)) return null;
  return { ...value, approvedReflectionFields: approved, recordedAt } as ReuseConsent;
}

export const emptyReflection = (): ReflectionDraft => ({ whatWorked: '', whatChanged: '', doDifferently: '' });

export const emptyAchievementDraft = (): AchievementDraft => ({
  outcome: '', evidence: [{ label: '', url: null }], reflection: emptyReflection(), approvedReflectionFields: []
});
