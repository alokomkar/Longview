import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import { usePlanMemory } from './usePlanMemory';
import type { PlanBriefDraft, PlanMemoryGateway, ResearchCandidate } from './types';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const candidate: ResearchCandidate = {
  schemaVersion: 1, researchId: 'research-123', requestId: 'request-123', sourcePlanId: 'plan-123',
  headline: 'Visible first value improves activation', finding: 'Users continue after seeing one meaningful outcome.',
  source: { kind: 'web', title: 'Activation research', locator: 'https://example.com', domain: 'example.com', publishedAt: null, retrievedAt: '2026-08-19T08:00:00.000Z' }
};
const draft: PlanBriefDraft = { focus: 'Prove first value', approach: 'Use accepted evidence in one bounded test.', successEvidence: 'Three users reach the visible checkpoint.', sourceResearchIds: ['research-123'] };

function gateway(): PlanMemoryGateway {
  return {
    loadResearch: vi.fn(async () => []),
    loadBrief: vi.fn(async () => ({ briefVersions: [], currentBrief: null, briefVersion: 0 })),
    reviewResearch: vi.fn(async () => ({
      duplicate: false,
      research: { card: { ...candidate, planId: 'plan-123', ownerUid: 'owner', workspaceId: 'default' as const, cardFingerprint: 'fingerprint', createdAt: '2026-08-19T08:00:00.000Z' }, decision: 'accepted' as const, revision: 1, latestReviewId: 'review-1234', reviewedAt: '2026-08-19T08:00:00.000Z' }
    })),
    saveBrief: vi.fn(async () => ({ duplicate: false, brief: { ...draft, schemaVersion: 1 as const, versionId: 'version-123', version: 1, planId: 'plan-123', ownerUid: 'owner', workspaceId: 'default' as const, requestFingerprint: 'fingerprint', recordedAt: '2026-08-19T08:00:00.000Z' } }))
  };
}

describe('usePlanMemory', () => {
  it('loads research and brief independently', async () => {
    const value = gateway();
    value.loadResearch = vi.fn(async () => { throw new Error('research unavailable'); });
    const { result } = renderHook(() => usePlanMemory(user, 'plan-123', value, true));
    await waitFor(() => expect(result.current.research.status).toBe('error'));
    expect(result.current.brief.status).toBe('ready');
  });

  it('reloads authoritative research after a reviewed write', async () => {
    const value = gateway();
    const reviewed = await value.reviewResearch(user, 'plan-123', 'review-1234', candidate, 'accepted', 0);
    (value.loadResearch as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]).mockResolvedValueOnce([reviewed.research]);
    const { result } = renderHook(() => usePlanMemory(user, 'plan-123', value, true));
    await waitFor(() => expect(result.current.research.status).toBe('ready'));
    await act(() => result.current.review('review-1234', candidate, 'accepted', 0));
    expect(result.current.research.values).toHaveLength(1);
    expect(value.loadResearch).toHaveBeenCalledTimes(2);
  });

  it('keeps the same save boundary through failure and permits retry', async () => {
    const value = gateway();
    value.saveBrief = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ duplicate: true, brief: {} });
    const { result } = renderHook(() => usePlanMemory(user, 'plan-123', value, true));
    await waitFor(() => expect(result.current.brief.status).toBe('ready'));
    await act(async () => { await expect(result.current.saveBrief('version-123', draft, 0)).rejects.toThrow('network'); });
    await act(async () => { await result.current.saveBrief('version-123', draft, 0); });
    expect(value.saveBrief).toHaveBeenNthCalledWith(1, user, 'plan-123', 'version-123', draft, 0);
    expect(value.saveBrief).toHaveBeenNthCalledWith(2, user, 'plan-123', 'version-123', draft, 0);
  });
});
