import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import type { Plan } from '../plan/types';
import { PlanResearchSourcesSection } from './PlanResearchSourcesSection';
import { DuplicateResearchSourceError, type PlanResearchSource, type PlanResearchSourceGateway } from './types';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const plan: Plan = { id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default', title: 'Launch Longview',
  outcome: 'Release a tested product to real users.', why: 'Learn what creates durable value.', targetDate: '2026-09-30',
  weeklyHours: 5, workingDays: ['mon'], status: 'active', schemaVersion: 2, scheduleVersion: 1 };
const saved: PlanResearchSource = {
  source: { schemaVersion: 1, sourceId: 'a'.repeat(64), ownerUid: 'owner', workspaceId: 'default', url: 'https://example.com/useful',
    normalizedUrl: 'https://example.com/useful', domain: 'example.com', title: 'Useful source',
    excerpt: 'A useful excerpt for this Plan.', capturedBy: 'user', capturedAt: '2026-08-21T08:00:00.000Z' },
  link: { schemaVersion: 1, sourceId: 'a'.repeat(64), planId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
    note: 'Use this for the first milestone.', topic: 'First milestone', state: 'inbox', requestId: 'request-123',
    requestFingerprint: 'fingerprint', createdAt: '2026-08-21T08:00:00.000Z' }
};

const fill = () => {
  fireEvent.change(screen.getByLabelText('Source URL'), { target: { value: saved.source.url } });
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: saved.source.title } });
  fireEvent.change(screen.getByLabelText('Useful excerpt'), { target: { value: saved.source.excerpt } });
  fireEvent.change(screen.getByLabelText('Topic or question'), { target: { value: saved.link.topic } });
  fireEvent.change(screen.getByLabelText('Why it matters'), { target: { value: saved.link.note } });
};

describe('PlanResearchSourcesSection', () => {
  it('validates, reviews, saves, and restores a Plan-scoped URL', async () => {
    let values: PlanResearchSource[] = [];
    const gateway: PlanResearchSourceGateway = {
      list: vi.fn(async () => values),
      save: vi.fn(async () => { values = [saved]; return { value: saved, duplicate: false }; })
    };
    render(<PlanResearchSourcesSection user={user} plan={plan} gateway={gateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add a URL' }));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Review source' }));
    expect(screen.getByText('Review before saving')).toBeVisible();
    expect(screen.getByText('Launch Longview', { selector: 'dd' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save source' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Source saved');
    expect(await screen.findByRole('link', { name: 'Open original URL' })).toHaveAttribute('href', saved.source.url);
    expect(gateway.save).toHaveBeenCalledOnce();
  });

  it('keeps an unsafe URL draft editable and performs no write', async () => {
    const gateway: PlanResearchSourceGateway = { list: vi.fn(async () => []), save: vi.fn() };
    render(<PlanResearchSourcesSection user={user} plan={plan} gateway={gateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add a URL' }));
    fireEvent.change(screen.getByLabelText('Source URL'), { target: { value: 'http://localhost/private' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review source' }));
    expect(screen.getByText('Use a public HTTPS URL without sign-in details.')).toBeVisible();
    expect(screen.getByLabelText('Source URL')).toHaveValue('http://localhost/private');
    expect(gateway.save).not.toHaveBeenCalled();
  });

  it('shows a changed duplicate without discarding the reviewed source', async () => {
    const gateway: PlanResearchSourceGateway = {
      list: vi.fn(async () => [saved]),
      save: vi.fn(async () => { throw new DuplicateResearchSourceError(); })
    };
    render(<PlanResearchSourcesSection user={user} plan={plan} gateway={gateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add a URL' })); fill();
    fireEvent.change(screen.getByLabelText('Why it matters'), { target: { value: 'A changed note for the same Plan.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review source' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save source' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already saved to this Plan');
    expect(screen.getByText('A changed note for the same Plan.', { selector: 'dd' })).toBeVisible();
  });

  it('retries a failed load without showing unconfirmed sources', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([saved]);
    render(<PlanResearchSourcesSection user={user} plan={plan} gateway={{ list, save: vi.fn() }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try saved URLs again' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open original URL' })).toBeVisible());
    expect(list).toHaveBeenCalledTimes(2);
  });
});
