import { describe, expect, it } from 'vitest';
import type { Plan } from '../plan/types';
import {
  buildResearchRequest,
  parsePlanBriefVersion,
  parseResearchResponse,
  parseResearchReview,
  parseStoredResearchCard,
  planBriefFingerprint,
  proposalFromResearch,
  researchCardFingerprint,
  validatePlanBriefDraft,
  validateResearchCandidate,
  validateResearchSource,
  type PlanBriefDraft,
  type ResearchCandidate,
  type ReviewedResearch
} from './types';

const plan: Plan = {
  id: 'plan-1234', clientRequestId: 'plan-1234', ownerUid: 'owner', workspaceId: 'default',
  title: 'Launch Longview', outcome: 'Release a tested planning workflow to real users.',
  why: 'Real usage is the strongest product evidence.', targetDate: '2026-09-30',
  weeklyHours: 6, workingDays: ['mon'], status: 'active', schemaVersion: 2, scheduleVersion: 1
};
const source = {
  kind: 'web' as const, title: 'Activation research', locator: 'https://example.com/research',
  domain: 'example.com', publishedAt: '2026-08-01T00:00:00.000Z', retrievedAt: '2026-08-19T08:00:00.000Z'
};
const candidate: ResearchCandidate = {
  schemaVersion: 1, researchId: 'research-123', requestId: 'request-123', sourcePlanId: plan.id,
  headline: 'Visible first value improves activation',
  finding: 'Users persist when the first meaningful outcome is visible early.', source
};
const timestamp = { toDate: () => new Date('2026-08-19T08:00:00.000Z') };

describe('Release 5 research and Plan Brief contracts', () => {
  it('requires trustworthy web or workspace attribution', () => {
    expect(validateResearchSource(source)).toBe(true);
    expect(validateResearchSource({ ...source, kind: 'web', locator: 'http://example.com' })).toBe(false);
    expect(validateResearchSource({ ...source, kind: 'workspace', locator: 'workspace/interviews/2', domain: null })).toBe(true);
    expect(validateResearchSource({ ...source, title: '', locator: '' })).toBe(false);
    expect(validateResearchSource({ ...source, retrievedAt: 'invalid' })).toBe(false);
  });

  it('parses only exact request and Plan-bound research responses', () => {
    const request = buildResearchRequest(plan, [], 'request-123');
    const response = { schemaVersion: 1, requestId: 'request-123', sourcePlanId: plan.id, cards: [candidate] };
    expect(parseResearchResponse(response, request)?.cards).toEqual([candidate]);
    expect(parseResearchResponse({ ...response, requestId: 'other-request' }, request)).toBeNull();
    expect(parseResearchResponse({ ...response, sourcePlanId: 'other-plan' }, request)).toBeNull();
    expect(parseResearchResponse({ ...response, cards: [{ ...candidate, source: { ...source, locator: 'missing-scheme' } }] }, request)).toBeNull();
    expect(parseResearchResponse({ ...response, cards: [candidate, candidate] }, request)).toBeNull();
    expect(parseResearchResponse({ ...response, cards: [] }, request)).toBeNull();
  });

  it('rejects missing and malformed card fields at every boundary', () => {
    expect(validateResearchCandidate(candidate, 'request-123', plan.id)).toBe(true);
    expect(validateResearchCandidate({
      ...candidate,
      source: { ...source, kind: 'workspace', locator: `workspace/plans/${plan.id}`, domain: null }
    }, 'request-123', plan.id)).toBe(true);
    expect(validateResearchCandidate({
      ...candidate,
      source: { ...source, kind: 'workspace', locator: 'workspace/plans/other-plan', domain: null }
    }, 'request-123', plan.id)).toBe(false);
    for (const invalid of [
      { ...candidate, researchId: 'short' },
      { ...candidate, headline: 'No' },
      { ...candidate, finding: 'Too short' },
      { ...candidate, sourcePlanId: 'other-plan' },
      { ...candidate, schemaVersion: 2 }
    ]) expect(validateResearchCandidate(invalid, 'request-123', plan.id)).toBe(false);
  });

  it('validates editable briefs and produces an attributed proposal', () => {
    const stored = {
      ...candidate, planId: plan.id, ownerUid: 'owner', workspaceId: 'default' as const,
      cardFingerprint: researchCardFingerprint(candidate), createdAt: '2026-08-19T08:00:00.000Z'
    };
    const reviewed: ReviewedResearch = {
      card: stored, decision: 'accepted', revision: 1, latestReviewId: 'review-1234', reviewedAt: stored.createdAt
    };
    const draft = proposalFromResearch(plan, [reviewed]);
    expect(validatePlanBriefDraft(draft)).toEqual({});
    expect(draft.sourceResearchIds).toEqual(['research-123']);
    expect(() => proposalFromResearch(plan, [{ ...reviewed, decision: 'deferred' }])).toThrow(/Accepted research/);
  });

  it('rejects empty, excessive, duplicate, and source-free brief drafts', () => {
    const valid: PlanBriefDraft = {
      focus: 'Prove first value', approach: 'Use the accepted evidence in one bounded test.',
      successEvidence: 'Three users reach the measurable checkpoint.', sourceResearchIds: ['research-123']
    };
    expect(validatePlanBriefDraft(valid)).toEqual({});
    expect(validatePlanBriefDraft({ ...valid, focus: 'No' })).toHaveProperty('focus');
    expect(validatePlanBriefDraft({ ...valid, approach: 'short' })).toHaveProperty('approach');
    expect(validatePlanBriefDraft({ ...valid, successEvidence: 'short' })).toHaveProperty('successEvidence');
    expect(validatePlanBriefDraft({ ...valid, sourceResearchIds: [] })).toHaveProperty('sourceResearchIds');
    expect(validatePlanBriefDraft({ ...valid, sourceResearchIds: ['research-001', 'research-002', 'research-003', 'research-004'] })).toHaveProperty('sourceResearchIds');
    expect(validatePlanBriefDraft({ ...valid, sourceResearchIds: ['research-123', 'research-123'] })).toHaveProperty('sourceResearchIds');
  });

  it('parses stored cards, reviews, and brief versions only with owner and fingerprint proof', () => {
    const cardStored = {
      ...candidate, planId: plan.id, ownerUid: 'owner', workspaceId: 'default',
      cardFingerprint: researchCardFingerprint(candidate), createdAt: timestamp
    };
    expect(parseStoredResearchCard(cardStored, candidate.researchId, plan.id, 'owner')).not.toBeNull();
    expect(parseStoredResearchCard({ ...cardStored, ownerUid: 'other' }, candidate.researchId, plan.id, 'owner')).toBeNull();

    const reviewStored = {
      schemaVersion: 1, reviewId: 'review-1234', researchId: candidate.researchId, planId: plan.id,
      ownerUid: 'owner', workspaceId: 'default', decision: 'accepted', revision: 1,
      requestFingerprint: 'fingerprint', reviewedAt: timestamp
    };
    expect(parseResearchReview(reviewStored, 'review-1234', plan.id, 'owner')).not.toBeNull();
    expect(parseResearchReview({ ...reviewStored, revision: 0 }, 'review-1234', plan.id, 'owner')).toBeNull();

    const draft: PlanBriefDraft = {
      focus: 'Prove first value', approach: 'Use the accepted evidence in one bounded test.',
      successEvidence: 'Three users reach the measurable checkpoint.', sourceResearchIds: ['research-123']
    };
    const briefStored = {
      ...draft, schemaVersion: 1, versionId: 'version-123', version: 2, planId: plan.id,
      ownerUid: 'owner', workspaceId: 'default', requestFingerprint: planBriefFingerprint(draft), recordedAt: timestamp
    };
    expect(parsePlanBriefVersion(briefStored, 'version-123', plan.id, 'owner')?.version).toBe(2);
    expect(parsePlanBriefVersion({ ...briefStored, requestFingerprint: 'wrong' }, 'version-123', plan.id, 'owner')).toBeNull();

    const wikiDraft: PlanBriefDraft = { ...draft, sourceResearchIds: [], sourceWikiVersionId: 'wiki-version-1' };
    const wikiStored = { ...briefStored, ...wikiDraft, requestFingerprint: planBriefFingerprint(wikiDraft) };
    const legacyWikiStored = { ...wikiStored, requestFingerprint: JSON.stringify([1, 'wiki-version-1', wikiDraft.focus, wikiDraft.approach, wikiDraft.successEvidence]) };
    expect(parsePlanBriefVersion(wikiStored, 'version-123', plan.id, 'owner')?.sourceWikiVersionId).toBe('wiki-version-1');
    expect(parsePlanBriefVersion(legacyWikiStored, 'version-123', plan.id, 'owner')?.sourceWikiVersionId).toBe('wiki-version-1');
  });
});
