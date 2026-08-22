import type { AuthUser } from '../auth/types';
import type { Plan } from '../plan/types';
import { toIso } from '../planRecord/types';

export type ResearchDecision = 'accepted' | 'rejected' | 'deferred';
export type ResearchSourceKind = 'web' | 'workspace';

export type ResearchSource = {
  kind: ResearchSourceKind;
  title: string;
  locator: string;
  domain: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  searchQueries?: string[];
};

export type ResearchCandidate = {
  schemaVersion: 1;
  researchId: string;
  requestId: string;
  sourcePlanId: string;
  headline: string;
  finding: string;
  source: ResearchSource;
};

export type ResearchRequest = {
  schemaVersion: 1;
  requestId: string;
  plan: Pick<Plan, 'id' | 'title' | 'outcome' | 'why' | 'targetDate'>;
  existingResearchIds: string[];
};

export type ResearchResponse = {
  schemaVersion: 1;
  requestId: string;
  sourcePlanId: string;
  cards: ResearchCandidate[];
};

export type StoredResearchCard = ResearchCandidate & {
  planId: string;
  ownerUid: string;
  workspaceId: 'default';
  cardFingerprint: string;
  createdAt: string;
};

export type ResearchReview = {
  schemaVersion: 1;
  reviewId: string;
  researchId: string;
  planId: string;
  ownerUid: string;
  workspaceId: 'default';
  decision: ResearchDecision;
  revision: number;
  requestFingerprint: string;
  reviewedAt: string;
};

export type ReviewedResearch = {
  card: StoredResearchCard;
  decision: ResearchDecision;
  revision: number;
  latestReviewId: string;
  reviewedAt: string;
};

export type PlanBriefDraft = {
  focus: string;
  approach: string;
  successEvidence: string;
  sourceResearchIds: string[];
  sourceWikiVersionId?: string | null;
};

export type PlanBriefVersion = PlanBriefDraft & {
  schemaVersion: 1;
  versionId: string;
  version: number;
  planId: string;
  ownerUid: string;
  workspaceId: 'default';
  requestFingerprint: string;
  recordedAt: string;
};

export type PlanMemoryBundle = {
  research: ReviewedResearch[];
  briefVersions: PlanBriefVersion[];
  currentBrief: PlanBriefVersion | null;
  briefVersion: number;
};

export type ResearchReviewResult = { research: ReviewedResearch; duplicate: boolean };
export type PlanBriefSaveResult = { brief: PlanBriefVersion; duplicate: boolean };

export interface ResearchGateway {
  request(user: AuthUser, request: ResearchRequest, signal: AbortSignal): Promise<unknown>;
}

export interface PlanMemoryGateway {
  loadResearch(user: AuthUser, planId: string): Promise<ReviewedResearch[]>;
  loadBrief(user: AuthUser, planId: string): Promise<Pick<PlanMemoryBundle, 'briefVersions' | 'currentBrief' | 'briefVersion'>>;
  reviewResearch(
    user: AuthUser,
    planId: string,
    reviewId: string,
    candidate: ResearchCandidate,
    decision: ResearchDecision,
    expectedRevision: number
  ): Promise<ResearchReviewResult>;
  saveBrief(
    user: AuthUser,
    planId: string,
    versionId: string,
    draft: PlanBriefDraft,
    expectedVersion: number
  ): Promise<PlanBriefSaveResult>;
}

export class ResearchConflictError extends Error {
  constructor() { super('Research review changed.'); this.name = 'ResearchConflictError'; }
}

export class PlanBriefConflictError extends Error {
  constructor() { super('Plan Brief changed.'); this.name = 'PlanBriefConflictError'; }
}

export class PlanMemoryIdempotencyConflictError extends Error {
  constructor() { super('The request key was reused with different content.'); this.name = 'PlanMemoryIdempotencyConflictError'; }
}

export class ResearchGatewayTimeoutError extends Error {
  constructor() { super('Research request timed out.'); this.name = 'ResearchGatewayTimeoutError'; }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textInRange = (value: unknown, minimum: number, maximum: number): value is string =>
  typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum;
const validId = (value: unknown) => textInRange(value, 8, 128) && !value.includes('/');
const validIso = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

export function validateResearchSource(value: unknown): value is ResearchSource {
  if (!isRecord(value) || !['web', 'workspace'].includes(String(value.kind))) return false;
  if (!textInRange(value.title, 3, 200) || !textInRange(value.locator, 3, 1000)) return false;
  if (value.kind === 'web' && !String(value.locator).startsWith('https://')) return false;
  if (value.kind === 'workspace' && !String(value.locator).startsWith('workspace/')) return false;
  if (value.domain !== null && !textInRange(value.domain, 3, 200)) return false;
  if (value.publishedAt !== null && !validIso(value.publishedAt)) return false;
  if (value.searchQueries !== undefined && (!Array.isArray(value.searchQueries) || value.searchQueries.length > 3 ||
      value.searchQueries.some(query => !textInRange(query, 1, 200)))) return false;
  return validIso(value.retrievedAt);
}

export function validateResearchCandidate(value: unknown, requestId?: string, planId?: string): value is ResearchCandidate {
  if (!isRecord(value) || value.schemaVersion !== 1 || !validId(value.researchId) || !validId(value.requestId)) return false;
  const sourcePlanId = String(value.sourcePlanId);
  return (!requestId || value.requestId === requestId) && (!planId || sourcePlanId === planId) &&
    textInRange(value.sourcePlanId, 1, 128) && textInRange(value.headline, 3, 160) &&
    textInRange(value.finding, 10, 800) && validateResearchSource(value.source) &&
    ((value.source as ResearchSource).kind !== 'workspace' || (value.source as ResearchSource).locator === `workspace/plans/${sourcePlanId}`);
}

export function parseResearchResponse(value: unknown, request: ResearchRequest): ResearchResponse | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.requestId !== request.requestId ||
      value.sourcePlanId !== request.plan.id || !Array.isArray(value.cards) || value.cards.length < 1 || value.cards.length > 3) return null;
  if (!value.cards.every(card => validateResearchCandidate(card, request.requestId, request.plan.id))) return null;
  const cards = value.cards as ResearchCandidate[];
  if (new Set(cards.map(card => card.researchId)).size !== cards.length ||
      cards.some(card => request.existingResearchIds.includes(card.researchId))) return null;
  return { schemaVersion: 1, requestId: request.requestId, sourcePlanId: request.plan.id, cards };
}

export function researchCardFingerprint(candidate: ResearchCandidate): string {
  return JSON.stringify([1, candidate.researchId, candidate.requestId, candidate.sourcePlanId,
    candidate.headline.trim(), candidate.finding.trim(), candidate.source]);
}

export function researchReviewFingerprint(candidate: ResearchCandidate, decision: ResearchDecision): string {
  return JSON.stringify([1, candidate.researchId, researchCardFingerprint(candidate), decision]);
}

export function validatePlanBriefDraft(draft: PlanBriefDraft): Partial<Record<keyof PlanBriefDraft, string>> {
  const errors: Partial<Record<keyof PlanBriefDraft, string>> = {};
  if (!textInRange(draft.focus, 3, 160)) errors.focus = 'Use 3–160 characters.';
  if (!textInRange(draft.approach, 10, 1000)) errors.approach = 'Use 10–1000 characters.';
  if (!textInRange(draft.successEvidence, 10, 600)) errors.successEvidence = 'Use 10–600 characters.';
  const wikiEvidence = draft.sourceWikiVersionId !== undefined && draft.sourceWikiVersionId !== null;
  if ((wikiEvidence && (!validId(draft.sourceWikiVersionId) || draft.sourceResearchIds.length !== 0)) ||
      (!wikiEvidence && (draft.sourceResearchIds.length < 1 || draft.sourceResearchIds.length > 3 ||
        new Set(draft.sourceResearchIds).size !== draft.sourceResearchIds.length ||
        draft.sourceResearchIds.some(id => !validId(id))))) errors.sourceResearchIds = 'Choose accepted research or one cited Wiki version.';
  return errors;
}

export function planBriefFingerprint(draft: PlanBriefDraft): string {
  const base = [1, draft.focus.trim(), draft.approach.trim(), draft.successEvidence.trim(), [...draft.sourceResearchIds].sort()];
  return JSON.stringify(draft.sourceWikiVersionId ? [...base, draft.sourceWikiVersionId] : base);
}

export function proposalFromResearch(plan: Plan, research: ReviewedResearch[]): PlanBriefDraft {
  const accepted = research.filter(value => value.decision === 'accepted');
  if (accepted.length === 0) throw new Error('Accepted research is required.');
  const first = accepted[0].card;
  return {
    focus: `Use evidence to advance ${plan.title}`.slice(0, 160),
    approach: `Act on this reviewed finding: ${first.finding}`.slice(0, 1000),
    successEvidence: `Confirm observable progress toward: ${plan.outcome}`.slice(0, 600),
    sourceResearchIds: accepted.map(value => value.card.researchId).slice(0, 3)
  };
}

export function parseStoredResearchCard(value: unknown, researchId: string, planId: string, ownerUid: string): StoredResearchCard | null {
  if (!isRecord(value)) return null;
  const createdAt = toIso(value.createdAt);
  const candidate = {
    schemaVersion: value.schemaVersion, researchId: value.researchId, requestId: value.requestId,
    sourcePlanId: value.sourcePlanId, headline: value.headline, finding: value.finding, source: value.source
  };
  if (!createdAt || !validateResearchCandidate(candidate, String(value.requestId), planId) ||
      value.researchId !== researchId || value.planId !== planId || value.ownerUid !== ownerUid ||
      value.workspaceId !== 'default' || value.cardFingerprint !== researchCardFingerprint(candidate as ResearchCandidate)) return null;
  return { ...(candidate as ResearchCandidate), planId, ownerUid, workspaceId: 'default', cardFingerprint: String(value.cardFingerprint), createdAt };
}

export function parseResearchReview(value: unknown, reviewId: string, planId: string, ownerUid: string): ResearchReview | null {
  if (!isRecord(value)) return null;
  const reviewedAt = toIso(value.reviewedAt);
  if (!reviewedAt || value.schemaVersion !== 1 || value.reviewId !== reviewId || !validId(value.researchId) ||
      value.planId !== planId || value.ownerUid !== ownerUid || value.workspaceId !== 'default' ||
      !['accepted', 'rejected', 'deferred'].includes(String(value.decision)) ||
      !Number.isInteger(value.revision) || Number(value.revision) < 1 || !textInRange(value.requestFingerprint, 1, 5000)) return null;
  return { ...value, reviewedAt } as ResearchReview;
}

export function parsePlanBriefVersion(value: unknown, versionId: string, planId: string, ownerUid: string): PlanBriefVersion | null {
  if (!isRecord(value)) return null;
  const draft = { focus: value.focus, approach: value.approach, successEvidence: value.successEvidence, sourceResearchIds: value.sourceResearchIds,
    ...(value.sourceWikiVersionId === undefined ? {} : { sourceWikiVersionId: value.sourceWikiVersionId }) } as PlanBriefDraft;
  const recordedAt = toIso(value.recordedAt);
  const legacyWikiFingerprint = draft.sourceWikiVersionId
    ? JSON.stringify([1, draft.sourceWikiVersionId, String(draft.focus).trim(), String(draft.approach).trim(), String(draft.successEvidence).trim()])
    : null;
  if (!recordedAt || value.schemaVersion !== 1 || value.versionId !== versionId || value.planId !== planId ||
      value.ownerUid !== ownerUid || value.workspaceId !== 'default' || !Number.isInteger(value.version) ||
      Number(value.version) < 1 || (value.requestFingerprint !== planBriefFingerprint(draft) && value.requestFingerprint !== legacyWikiFingerprint) ||
      Object.keys(validatePlanBriefDraft(draft)).length > 0) return null;
  return { ...value, ...draft, recordedAt } as PlanBriefVersion;
}

export const buildResearchRequest = (plan: Plan, existingResearchIds: string[], requestId: string): ResearchRequest => ({
  schemaVersion: 1,
  requestId,
  plan: { id: plan.id, title: plan.title, outcome: plan.outcome, why: plan.why, targetDate: plan.targetDate },
  existingResearchIds: [...existingResearchIds].sort()
});
