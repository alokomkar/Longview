import { describe, expect, it } from 'vitest';
import {
  achievementFingerprint,
  emptyAchievementDraft,
  normalizeAchievementDraft,
  parseAchievementRecord,
  parseReflectionRecord,
  parseReuseConsent,
  validateAchievementDraft,
  type FinishAchievementRequest
} from './types';

const timestamp = { toDate: () => new Date('2026-08-19T08:00:00.000Z') };
const validRequest = (): FinishAchievementRequest => ({
  achievementId: 'achievement-123', reflectionId: 'reflection-123', consentId: 'consent-123',
  expectedPlanRevision: 1, completedStepIds: ['completion-123'],
  draft: {
    outcome: 'Released one tested planning workflow.',
    evidence: [{ label: 'Production acceptance', url: 'https://example.com/proof' }],
    reflection: { whatWorked: 'Small releases worked.', whatChanged: '', doDifferently: '' },
    approvedReflectionFields: ['whatWorked']
  }
});

describe('achievement types', () => {
  it('normalizes exact consent and defaults reflection reuse to off', () => {
    const draft = validRequest().draft;
    draft.reflection.whatWorked = '  Small releases worked.  ';
    draft.approvedReflectionFields = ['whatWorked', 'whatChanged'];
    expect(normalizeAchievementDraft(draft)).toMatchObject({
      reflection: { whatWorked: 'Small releases worked.', whatChanged: '' },
      approvedReflectionFields: ['whatWorked']
    });
    expect(normalizeAchievementDraft(emptyAchievementDraft()).approvedReflectionFields).toEqual([]);
  });

  it.each([
    ['short outcome', { outcome: 'short' }],
    ['missing evidence', { evidence: [] }],
    ['insecure evidence URL', { evidence: [{ label: 'Useful proof', url: 'http://example.com' }] }],
    ['too many evidence references', { evidence: Array.from({ length: 4 }, (_, index) => ({ label: `Proof ${index}`, url: null })) }]
  ])('rejects %s', (_label, change) => {
    expect(Object.keys(validateAchievementDraft({ ...validRequest().draft, ...change }))).not.toHaveLength(0);
  });

  it('produces a stable, consent-sensitive idempotency fingerprint', () => {
    const request = validRequest();
    expect(achievementFingerprint(request)).toBe(achievementFingerprint({ ...request, completedStepIds: [...request.completedStepIds].reverse() }));
    expect(achievementFingerprint(request)).not.toBe(achievementFingerprint({ ...request, draft: { ...request.draft, approvedReflectionFields: [] } }));
  });

  it('parses valid immutable records and rejects malformed or cross-owner data', () => {
    const request = validRequest();
    const achievement = {
      schemaVersion: 1, achievementId: request.achievementId, planId: 'plan-123', ownerUid: 'owner', workspaceId: 'default',
      outcome: request.draft.outcome, evidence: request.draft.evidence, completedStepIds: request.completedStepIds,
      expectedPlanRevision: 1, reflectionId: request.reflectionId, requestFingerprint: achievementFingerprint(request), recordedAt: timestamp
    };
    expect(parseAchievementRecord(achievement, request.achievementId, 'plan-123', 'owner')).not.toBeNull();
    expect(parseAchievementRecord({ ...achievement, ownerUid: 'other' }, request.achievementId, 'plan-123', 'owner')).toBeNull();
    expect(parseReflectionRecord({ schemaVersion: 1, reflectionId: request.reflectionId, achievementId: request.achievementId, planId: 'plan-123', ownerUid: 'owner', workspaceId: 'default', whatWorked: 'Worked', whatChanged: '', doDifferently: '', recordedAt: timestamp }, request.reflectionId, request.achievementId, 'plan-123', 'owner')).not.toBeNull();
    expect(parseReuseConsent({ schemaVersion: 1, consentId: request.consentId, achievementId: request.achievementId, reflectionId: request.reflectionId, planId: 'plan-123', ownerUid: 'owner', workspaceId: 'default', purpose: 'future_plan_guidance', approvedReflectionFields: ['whatWorked'], version: 1, previousConsentId: null, requestFingerprint: 'fingerprint', recordedAt: timestamp }, request.consentId, request.achievementId, 'plan-123', 'owner')).not.toBeNull();
  });
});
