import { describe, expect, it } from 'vitest';
import {
  normalizePlanIds,
  normalizeResearchUrl,
  sourceCreateFingerprint,
  sourceIdForUrl,
  validatePlanResearchSourceDraft,
  validateResearchSourceStateDraft,
  validateWikiBriefDraft,
  validateWikiDraft,
  type PlanResearchSourceDraft,
  type ResearchSourceStateDraft
} from './types';

const valid: PlanResearchSourceDraft = {
  url: 'https://Example.com/article/?utm_source=test&b=2&a=1#section', title: 'A useful source',
  excerpt: 'This excerpt contains useful evidence.', note: 'Apply this to the first milestone.', topic: 'First milestone'
};
const state: ResearchSourceStateDraft = { note: valid.note, topic: valid.topic, workflowState: 'inbox', planIds: ['plan-2', 'plan-1'] };

describe('Plan research workspace contracts', () => {
  it('normalizes public URLs and rejects local, private, credentialed, or non-HTTPS input', () => {
    expect(normalizeResearchUrl(valid.url)).toBe('https://example.com/article?a=1&b=2');
    for (const value of ['http://example.com/page', 'https://localhost/page', 'https://127.0.0.1/page', 'https://10.0.0.2/page', 'https://user:secret@example.com/page', 'not a URL']) {
      expect(normalizeResearchUrl(value)).toBeNull();
    }
  });

  it('validates source, organization, Plan links, and every workflow state', () => {
    expect(validatePlanResearchSourceDraft(valid)).toEqual({});
    expect(normalizePlanIds(['plan-2', 'plan-1', 'plan-1'])).toEqual(['plan-1', 'plan-2']);
    for (const workflowState of ['inbox', 'reading', 'useful', 'archived'] as const) {
      expect(validateResearchSourceStateDraft({ ...state, workflowState })).toBe(true);
    }
    expect(validateResearchSourceStateDraft({ ...state, planIds: Array.from({ length: 6 }, (_, index) => `plan-${index}`) })).toBe(false);
  });

  it('validates cited Wiki revisions and Wiki-backed Plan Briefs', () => {
    const wiki = { pageId: 'wiki-page-1', title: 'First value', body: 'A sufficiently detailed synthesis for this Plan.',
      citations: [{ sourceId: 'a'.repeat(64), statement: 'The first useful result should be visible.' }] };
    expect(validateWikiDraft(wiki)).toEqual({});
    expect(validateWikiDraft({ ...wiki, citations: [] })).toHaveProperty('citations');
    expect(validateWikiBriefDraft({ focus: 'Prove first value', approach: 'Run one bounded test with real users.', successEvidence: 'Three users complete the visible checkpoint.' })).toEqual({});
  });

  it('derives stable IDs and fingerprints all reviewed organization', async () => {
    const normalized = normalizeResearchUrl(valid.url)!;
    await expect(sourceIdForUrl(normalized)).resolves.toMatch(/^[a-f0-9]{64}$/);
    expect(sourceCreateFingerprint(valid, normalized, state)).not.toBe(sourceCreateFingerprint(valid, normalized, { ...state, planIds: [] }));
  });
});
