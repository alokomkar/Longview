import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import type { Plan } from '../plan/types';
import { PlanMemorySection } from './PlanMemorySection';
import {
  PlanBriefConflictError,
  PlanMemoryIdempotencyConflictError,
  ResearchConflictError,
  planBriefFingerprint,
  researchCardFingerprint,
  type PlanBriefVersion,
  type PlanMemoryGateway,
  type ResearchCandidate,
  type ResearchDecision,
  type ResearchGateway,
  type ReviewedResearch
} from './types';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const plan: Plan = {
  id: 'plan-123', clientRequestId: 'plan-123', ownerUid: 'owner', workspaceId: 'default',
  title: 'Launch Longview', outcome: 'Release a tested planning workflow to real users.',
  why: 'Real user evidence should guide the next release.', targetDate: '2026-09-30', weeklyHours: 6,
  workingDays: ['mon'], status: 'active', schemaVersion: 2, scheduleVersion: 1
};
const candidate: ResearchCandidate = {
  schemaVersion: 1, researchId: 'research-123', requestId: 'research-request-123', sourcePlanId: plan.id,
  headline: 'Visible first value improves activation',
  finding: 'Users continue setup after seeing one meaningful outcome.',
  source: { kind: 'web', title: 'Activation research', locator: 'https://example.com/research', domain: 'example.com', publishedAt: null, retrievedAt: '2026-08-19T08:00:00.000Z' }
};

function researchGateway(value: unknown = null): ResearchGateway {
  return { request: vi.fn(async (_user, request) => value ?? ({ schemaVersion: 1, requestId: request.requestId, sourcePlanId: plan.id, cards: [{ ...candidate, requestId: request.requestId }] })) };
}

function statefulMemory(options: { briefError?: Error; researchError?: Error; researchLoadError?: boolean; briefLoadError?: boolean } = {}) {
  let research: ReviewedResearch[] = [];
  let versions: PlanBriefVersion[] = [];
  const gateway: PlanMemoryGateway = {
    loadResearch: vi.fn(async () => { if (options.researchLoadError) throw new Error('research load'); return research; }),
    loadBrief: vi.fn(async () => {
      if (options.briefLoadError) throw new Error('brief load');
      return { briefVersions: versions, currentBrief: versions[0] ?? null, briefVersion: versions[0]?.version ?? 0 };
    }),
    reviewResearch: vi.fn(async (_user, _planId, reviewId, value, decision: ResearchDecision, expectedRevision) => {
      if (options.researchError) throw options.researchError;
      const prior = research.find(item => item.card.researchId === value.researchId);
      const saved: ReviewedResearch = {
        card: prior?.card ?? { ...value, planId: plan.id, ownerUid: 'owner', workspaceId: 'default', cardFingerprint: researchCardFingerprint(value), createdAt: '2026-08-19T08:00:00.000Z' },
        decision, revision: expectedRevision + 1, latestReviewId: reviewId, reviewedAt: '2026-08-19T08:00:00.000Z'
      };
      research = [saved, ...research.filter(item => item.card.researchId !== value.researchId)];
      return { research: saved, duplicate: false };
    }),
    saveBrief: vi.fn(async (_user, _planId, versionId, draft, expectedVersion) => {
      if (options.briefError) throw options.briefError;
      const brief: PlanBriefVersion = { ...draft, schemaVersion: 1, versionId, version: expectedVersion + 1, planId: plan.id, ownerUid: 'owner', workspaceId: 'default', requestFingerprint: planBriefFingerprint(draft), recordedAt: '2026-08-19T09:00:00.000Z' };
      versions = [brief, ...versions];
      return { brief, duplicate: false };
    })
  };
  return gateway;
}

describe('PlanMemorySection', () => {
  beforeEach(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }));

  it('reviews all three card decisions and saves an edited, attributed brief version', async () => {
    const memory = statefulMemory();
    render(<PlanMemorySection user={user} plan={plan} memoryGateway={memory} researchGateway={researchGateway()} />);
    await screen.findByText('No reviewed research is saved for this Plan yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Find new research' }));
    expect(await screen.findByText(candidate.headline)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm not now' }));
    expect(await screen.findByText(/Not now · revision 1/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejected' }));
    expect(await screen.findByText(/Rejected · revision 2/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm accepted' }));
    expect(await screen.findByText(/Accepted · revision 3/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Prepare Plan Brief from 1 accepted card/ }));
    fireEvent.change(screen.getByLabelText('Focus'), { target: { value: 'Prove repeatable first value' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review Plan Brief' }));
    expect(screen.getByText(/expected current version 0/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save version 1' }));
    expect(await screen.findByText('Plan Brief saved.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Prove repeatable first value' })).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Version history' }));
    expect(screen.getByText('Version 1 · current')).toBeVisible();
  });

  it('cancels research and proposal work without a durable write', async () => {
    let reject: (error: unknown) => void = () => undefined;
    const gateway: ResearchGateway = { request: vi.fn((_user, _request, signal) => new Promise((_resolve, fail) => {
      reject = fail; signal.addEventListener('abort', () => fail(new DOMException('Cancelled', 'AbortError')));
    })) };
    const memory = statefulMemory();
    render(<PlanMemorySection user={user} plan={plan} memoryGateway={memory} researchGateway={gateway} />);
    await screen.findByText('No reviewed research is saved for this Plan yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Find new research' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel research' }));
    reject(new DOMException('Cancelled', 'AbortError'));
    expect(memory.reviewResearch).not.toHaveBeenCalled();
    expect(memory.saveBrief).not.toHaveBeenCalled();
  });

  it('fails malformed research safely while keeping the current brief independently available', async () => {
    const memory = statefulMemory();
    const malformed = { schemaVersion: 1, requestId: 'wrong', sourcePlanId: plan.id, cards: [] };
    render(<PlanMemorySection user={user} plan={plan} memoryGateway={memory} researchGateway={researchGateway(malformed)} />);
    await screen.findByText('No reviewed research is saved for this Plan yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Find new research' }));
    expect(await screen.findByText('This research could not be used.')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Current Plan Brief' }));
    expect(screen.getByText('No Plan Brief version has been approved yet.')).toBeVisible();
    expect(memory.reviewResearch).not.toHaveBeenCalled();
  });

  it('protects a newer brief from stale edits and reloads the authoritative version', async () => {
    const memory = statefulMemory({ briefError: new PlanBriefConflictError() });
    await memory.reviewResearch(user, plan.id, 'review-seed', candidate, 'accepted', 0);
    render(<PlanMemorySection user={user} plan={plan} memoryGateway={memory} researchGateway={researchGateway()} />);
    await screen.findByText(/Accepted · revision 1/);
    fireEvent.click(screen.getByRole('button', { name: /Prepare Plan Brief from 1 accepted card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Review Plan Brief' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save version 1' }));
    expect(await screen.findByText('A newer Plan Brief already exists.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'View current version' }));
    await waitFor(() => expect(memory.loadBrief).toHaveBeenCalledTimes(2));
  });

  it('blocks stale research retries until the authoritative decision is reloaded', async () => {
    const memory = statefulMemory({ researchError: new ResearchConflictError() });
    render(<PlanMemorySection user={user} plan={plan} memoryGateway={memory} researchGateway={researchGateway()} />);
    await screen.findByText('No reviewed research is saved for this Plan yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Find new research' }));
    await screen.findByText(candidate.headline);
    fireEvent.click(screen.getByRole('button', { name: /^Accept$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm accepted' }));
    expect(await screen.findByText('This research changed in another tab.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm accepted' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'View current research' }));
    await waitFor(() => expect(memory.loadResearch).toHaveBeenCalledTimes(2));
  });

  it('recovers an idempotency mismatch with a new Plan Brief save key', async () => {
    const memory = statefulMemory({ briefError: new PlanMemoryIdempotencyConflictError() });
    const seeded = statefulMemory();
    const accepted = await seeded.reviewResearch(user, plan.id, 'review-seed', candidate, 'accepted', 0);
    memory.loadResearch = vi.fn(async () => [accepted.research]);
    render(<PlanMemorySection user={user} plan={plan} memoryGateway={memory} researchGateway={researchGateway()} />);
    await screen.findByText(/Accepted · revision 1/);
    fireEvent.click(screen.getByRole('button', { name: /Prepare Plan Brief from 1 accepted card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Review Plan Brief' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save version 1' }));
    expect(await screen.findByText('This request no longer matches its review.')).toBeVisible();
    const firstKey = (memory.saveBrief as ReturnType<typeof vi.fn>).mock.calls[0][2];
    fireEvent.click(screen.getByRole('button', { name: 'Start a new save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save version 1' }));
    await waitFor(() => expect(memory.saveBrief).toHaveBeenCalledTimes(2));
    expect((memory.saveBrief as ReturnType<typeof vi.fn>).mock.calls[1][2]).not.toBe(firstKey);
  });

  it('keeps research and brief read failures isolated', async () => {
    render(<PlanMemorySection user={user} plan={plan} memoryGateway={statefulMemory({ researchLoadError: true })} researchGateway={researchGateway()} />);
    expect(await screen.findByText('Saved research couldn’t be refreshed.')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Current Plan Brief' }));
    expect(screen.getByText('No Plan Brief version has been approved yet.')).toBeVisible();
  });
});
