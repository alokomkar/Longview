import { describe, expect, it } from 'vitest';
import {
  draftFromRecommendation,
  newestFirst,
  parsePlanRecord,
  planRecordFingerprint,
  validatePlanRecordDraft,
  type PlanRecordDraft
} from './types';

const decision: PlanRecordDraft = {
  kind: 'decision', summary: 'Ship the narrow release first.',
  rationale: 'It creates a trustworthy user-feedback loop.', confidence: null,
  sourceFacts: [], sourceRecommendationId: null
};
const guidance: PlanRecordDraft = {
  kind: 'clara-guidance', summary: 'Interview five users after release.',
  rationale: 'The Plan needs evidence from real usage.', confidence: 'medium',
  sourceFacts: ['The Plan is ready for its first users.'], sourceRecommendationId: 'request-123'
};
const timestamp = { toDate: () => new Date('2026-08-19T08:00:00.000Z') };

describe('Plan record contracts', () => {
  it.each([decision, guidance])('validates and fingerprints $kind records deterministically', draft => {
    expect(validatePlanRecordDraft(draft)).toEqual({});
    expect(planRecordFingerprint({ ...draft, summary: ` ${draft.summary} ` })).toBe(planRecordFingerprint(draft));
  });

  it('rejects every invalid decision boundary and recommendation metadata leak', () => {
    expect(validatePlanRecordDraft({ ...decision, summary: 'No' })).toHaveProperty('summary');
    expect(validatePlanRecordDraft({ ...decision, rationale: 'Too short' })).toHaveProperty('rationale');
    expect(validatePlanRecordDraft({ ...decision, confidence: 'high' })).toHaveProperty('sourceFacts');
    expect(validatePlanRecordDraft({ ...decision, summary: 'x'.repeat(501) })).toHaveProperty('summary');
    expect(validatePlanRecordDraft({ ...decision, rationale: 'x'.repeat(501) })).toHaveProperty('rationale');
  });

  it('rejects incomplete or excessive guidance context', () => {
    expect(validatePlanRecordDraft({ ...guidance, confidence: null })).toHaveProperty('sourceFacts');
    expect(validatePlanRecordDraft({ ...guidance, sourceFacts: [] })).toHaveProperty('sourceFacts');
    expect(validatePlanRecordDraft({ ...guidance, sourceFacts: ['a', 'b', 'c', 'd', 'e'] })).toHaveProperty('sourceFacts');
    expect(validatePlanRecordDraft({ ...guidance, sourceRecommendationId: 'short' })).toHaveProperty('sourceFacts');
  });

  it('parses only an owner-bound record with an exact fingerprint and timestamp', () => {
    const stored = {
      ...decision, recordId: 'decision-123', planId: 'plan-123', ownerUid: 'owner', workspaceId: 'default',
      requestFingerprint: planRecordFingerprint(decision), schemaVersion: 1, recordedAt: timestamp
    };
    expect(parsePlanRecord(stored, 'decision-123', 'plan-123', 'owner')?.recordedAt).toBe('2026-08-19T08:00:00.000Z');
    expect(parsePlanRecord({ ...stored, ownerUid: 'other' }, 'decision-123', 'plan-123', 'owner')).toBeNull();
    expect(parsePlanRecord({ ...stored, requestFingerprint: 'wrong' }, 'decision-123', 'plan-123', 'owner')).toBeNull();
    expect(parsePlanRecord({ ...stored, recordedAt: null }, 'decision-123', 'plan-123', 'owner')).toBeNull();
  });

  it('creates retained guidance from the exact validated recommendation', () => {
    const draft = draftFromRecommendation({
      schemaVersion: 1, requestId: 'request-123', sourcePlanId: 'plan-123', headline: 'Release, then learn',
      recommendation: guidance.summary, rationale: guidance.rationale, confidence: 'medium',
      requiresClarification: false, sourceFacts: guidance.sourceFacts, proposedChange: null
    });
    expect(draft).toEqual(guidance);
  });

  it('orders mixed history deterministically newest-first', () => {
    expect(newestFirst([
      { id: 'b', recordedAt: '2026-08-18T00:00:00.000Z' },
      { id: 'a', recordedAt: '2026-08-19T00:00:00.000Z' },
      { id: 'c', recordedAt: '2026-08-19T00:00:00.000Z' }
    ]).map(value => value.id)).toEqual(['c', 'a', 'b']);
  });
});
