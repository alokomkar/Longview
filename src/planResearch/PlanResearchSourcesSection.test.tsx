import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import type { Plan } from '../plan/types';
import { PlanResearchSourcesSection } from './PlanResearchSourcesSection';
import type { PlanMatchGateway } from './matching';
import type { PlanResearchSourceGateway, PlanResearchWikiSnapshot, WorkspaceResearchSource } from './types';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const plan: Plan = { id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default', title: 'Launch Longview',
  outcome: 'Release a tested product to real users.', why: 'Learn what creates durable value.', targetDate: '2026-09-30',
  weeklyHours: 5, workingDays: ['mon'], status: 'active', schemaVersion: 2, scheduleVersion: 1 };
const otherPlan: Plan = { ...plan, id: 'plan-2', clientRequestId: 'plan-2', title: 'Research activation', outcome: 'Understand the first useful user result.' };
const saved: WorkspaceResearchSource = {
  source: { schemaVersion: 1, sourceId: 'a'.repeat(64), ownerUid: 'owner', workspaceId: 'default', url: 'https://example.com/useful',
    normalizedUrl: 'https://example.com/useful', domain: 'example.com', title: 'Useful source', excerpt: 'A useful excerpt for this Plan.',
    capturedBy: 'user', capturedAt: '2026-08-21T08:00:00.000Z' },
  state: { schemaVersion: 1, sourceId: 'a'.repeat(64), ownerUid: 'owner', workspaceId: 'default', note: 'Use this for the first milestone.',
    topic: 'First milestone', workflowState: 'inbox', planIds: ['plan-1'], revision: 1, latestEventId: 'event-123', updatedAt: '2026-08-21T08:00:00.000Z' }
};

function harness(initial: WorkspaceResearchSource[] = []) {
  let values = initial;
  let wiki: PlanResearchWikiSnapshot = { pages: [], briefVersion: 0 };
  const gateway: PlanResearchSourceGateway = {
    list: vi.fn(async () => values),
    save: vi.fn(async (_user, requestId, draft, state) => {
      const value: WorkspaceResearchSource = { source: { ...saved.source, url: draft.url, normalizedUrl: draft.url, title: draft.title, excerpt: draft.excerpt },
        state: { ...saved.state, note: state.note, topic: state.topic, workflowState: state.workflowState, planIds: state.planIds, latestEventId: requestId } };
      values = [value, ...values]; return { value, duplicate: false };
    }),
    update: vi.fn(async (_user, sourceId, eventId, expectedRevision, state) => {
      const existing = values.find(value => value.source.sourceId === sourceId)!;
      const value = { ...existing, state: { ...existing.state, ...state, revision: expectedRevision + 1, latestEventId: eventId } };
      values = values.map(item => item.source.sourceId === sourceId ? value : item); return { value, duplicate: false };
    }),
    loadWiki: vi.fn(async () => wiki),
    saveWiki: vi.fn(async (_user, planId, versionId, expectedVersion, draft) => {
      const version = { ...draft, schemaVersion: 1 as const, versionId, version: expectedVersion + 1, planId, ownerUid: 'owner', workspaceId: 'default' as const, requestFingerprint: 'fingerprint', recordedAt: '2026-08-21T09:00:00.000Z' };
      const page = { schemaVersion: 1 as const, pageId: draft.pageId, planId, ownerUid: 'owner', workspaceId: 'default' as const, title: draft.title, currentVersion: version.version, currentVersionId: versionId, updatedAt: version.recordedAt };
      wiki = { ...wiki, pages: [{ page, current: version, versions: [version] }] }; return { value: version, duplicate: false };
    }),
    promoteWiki: vi.fn(async (_user, _planId, _versionId, expected) => { wiki = { ...wiki, briefVersion: expected + 1 }; return { version: expected + 1, duplicate: false }; })
  };
  const matchGateway: PlanMatchGateway = { match: vi.fn(async (_user, request) => ({ schemaVersion: 1, requestId: request.requestId, requiresClarification: false,
    summary: 'One Plan has a materially stronger contextual match.', candidates: [{ planId: 'plan-1', score: 88, confidence: 'high', rationale: 'The source and Plan both discuss a tested product release.' }] })) };
  return { gateway, matchGateway };
}

const renderWorkspace = (initial: WorkspaceResearchSource[] = []) => {
  const value = harness(initial);
  render(<PlanResearchSourcesSection user={user} plan={plan} plans={[plan, otherPlan]} gateway={value.gateway} matchGateway={value.matchGateway} />);
  return value;
};
const fill = () => {
  fireEvent.change(screen.getByLabelText('Source URL'), { target: { value: saved.source.url } });
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: saved.source.title } });
  fireEvent.change(screen.getByLabelText('Useful excerpt'), { target: { value: saved.source.excerpt } });
  fireEvent.change(screen.getByLabelText('Topic or question'), { target: { value: saved.state.topic } });
  fireEvent.change(screen.getByLabelText('Why it matters'), { target: { value: saved.state.note } });
};

describe('PlanResearchSourcesSection', () => {
  it('captures, manually associates, reviews, saves, and restores one source', async () => {
    const { gateway } = renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a source' })); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Plans myself' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review source and associations' }));
    expect(screen.getByText('Launch Longview', { selector: 'dd' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save source' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Source saved');
    expect(await screen.findByText('Useful source', { selector: 'h3' })).toBeVisible();
    expect(gateway.save).toHaveBeenCalledOnce();
  });

  it('shows Clara progress and requires user confirmation of its read-only suggestion', async () => {
    const { matchGateway } = renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a source' })); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Ask Clara to suggest Plans' }));
    expect(await screen.findByText('Review Clara’s suggestion.')).toBeVisible();
    expect(screen.getByText('Launch Longview · 88%')).toBeVisible();
    expect(matchGateway.match).toHaveBeenCalledOnce();
  });

  it('cancels Clara matching without discarding the unsaved source', async () => {
    const { matchGateway } = renderWorkspace();
    vi.mocked(matchGateway.match).mockImplementation(async () => new Promise(() => undefined));
    fireEvent.click(await screen.findByRole('button', { name: 'Add a source' })); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Ask Clara to suggest Plans' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel matching' }));
    expect(screen.getByLabelText('Title')).toHaveValue(saved.source.title);
    expect(screen.getByText('Nothing is saved yet.')).toBeVisible();
  });

  it('keeps a source unassigned without guessing a Plan', async () => {
    const { gateway } = renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a source' })); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Plans myself' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Launch Longview/ }));
    expect(screen.getByText('Keep in Unassigned research.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Review source and associations' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save source' }));
    await waitFor(() => expect(gateway.save).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.anything(), expect.objectContaining({ planIds: [] })));
  });

  it('reviews workflow movement before changing durable organization', async () => {
    const { gateway } = renderWorkspace([saved]);
    fireEvent.click(await screen.findByRole('button', { name: 'Move to Useful' }));
    expect(screen.getByText('Useful', { selector: 'dd' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm changes' }));
    await waitFor(() => expect(gateway.update).toHaveBeenCalledOnce());
    expect(await screen.findByText('Useful · saved by you')).toBeVisible();
  });

  it('saves a cited Wiki revision and explicitly promotes it to a new Plan Brief version', async () => {
    const useful = { ...saved, state: { ...saved.state, workflowState: 'useful' as const } };
    const { gateway } = renderWorkspace([useful]);
    fireEvent.click(await screen.findByRole('tab', { name: /Plan Wiki/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Wiki page' }));
    fireEvent.change(screen.getByLabelText('Page title'), { target: { value: 'First value' } });
    fireEvent.change(screen.getByLabelText('Your synthesis'), { target: { value: 'A visible first result should happen before expansion.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review Wiki revision' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Wiki revision' }));
    expect(await screen.findByText('Wiki revision saved.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Promote to Plan Brief' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review Plan Brief proposal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Plan Brief version 1' }));
    expect(await screen.findByText('Plan Brief version saved.')).toBeVisible();
    expect(gateway.saveWiki).toHaveBeenCalledOnce();
    expect(gateway.promoteWiki).toHaveBeenCalledOnce();
  });

  it('preserves an unsaved Wiki draft when returning from review', async () => {
    const useful = { ...saved, state: { ...saved.state, workflowState: 'useful' as const } };
    renderWorkspace([useful]);
    fireEvent.click(await screen.findByRole('tab', { name: /Plan Wiki/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Wiki page' }));
    fireEvent.change(screen.getByLabelText('Page title'), { target: { value: 'Unsaved synthesis' } });
    fireEvent.change(screen.getByLabelText('Your synthesis'), { target: { value: 'Keep this exact draft while reviewing it.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review Wiki revision' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
    expect(screen.getByLabelText('Page title')).toHaveValue('Unsaved synthesis');
    expect(screen.getByLabelText('Your synthesis')).toHaveValue('Keep this exact draft while reviewing it.');
  });
});
