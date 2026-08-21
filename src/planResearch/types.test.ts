import { describe, expect, it } from 'vitest';
import {
  normalizeResearchUrl,
  planSourceLinkFingerprint,
  sourceIdForUrl,
  validatePlanResearchSourceDraft,
  type PlanResearchSourceDraft
} from './types';

const valid: PlanResearchSourceDraft = {
  url: 'https://Example.com/article/?utm_source=test&b=2&a=1#section',
  title: 'A useful source', excerpt: 'This excerpt contains useful evidence.',
  note: 'Apply this to the first milestone.', topic: 'First milestone'
};

describe('Plan research source contracts', () => {
  it('normalizes a public HTTPS URL and removes tracking and fragments', () => {
    expect(normalizeResearchUrl(valid.url)).toBe('https://example.com/article?a=1&b=2');
  });

  it.each([
    'http://example.com/page', 'https://localhost/page', 'https://127.0.0.1/page',
    'https://10.0.0.2/page', 'https://user:secret@example.com/page', 'not a URL'
  ])('rejects unsafe URL %s', value => expect(normalizeResearchUrl(value)).toBeNull());

  it('validates every required user-authored field at its boundaries', () => {
    expect(validatePlanResearchSourceDraft(valid)).toEqual({});
    expect(validatePlanResearchSourceDraft({ url: '', title: 'x', excerpt: 'short', note: '', topic: '' }))
      .toEqual({
        url: 'Use a public HTTPS URL without sign-in details.', title: 'Use 3–200 characters.',
        excerpt: 'Use 10–2000 characters.', note: 'Use 3–1000 characters.', topic: 'Use 2–120 characters.'
      });
  });

  it('derives a stable collision-resistant source id and content fingerprint', async () => {
    const normalized = normalizeResearchUrl(valid.url)!;
    await expect(sourceIdForUrl(normalized)).resolves.toMatch(/^[a-f0-9]{64}$/);
    expect(await sourceIdForUrl(normalized)).toBe(await sourceIdForUrl(normalized));
    expect(planSourceLinkFingerprint(valid, normalized)).not.toBe(planSourceLinkFingerprint({ ...valid, note: 'Different use' }, normalized));
  });
});
