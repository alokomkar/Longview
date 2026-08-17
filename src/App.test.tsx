import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AuthGateway, AuthUser } from './auth/types';
import type { WorkspaceGateway } from './workspace/types';
import { PlanScheduleConflictError, type Plan, type PlanGateway } from './plan/types';
import type { TodayGateway } from './today/types';
import type { ClaraGateway } from './clara/types';
import type { ClaraApprovalGateway } from './clara/approvalTypes';

const workspaceGateway: WorkspaceGateway = {
  ensure: vi.fn(async (user: AuthUser) => ({ id: 'default' as const, ownerUid: user.uid, schemaVersion: 1 as const }))
};

const planGateway: PlanGateway = {
  create: vi.fn(async (user, draft) => ({ ...draft, id: draft.clientRequestId, ownerUid: user.uid, workspaceId: 'default' as const, status: 'active' as const, schemaVersion: 2 as const, scheduleVersion: 1 })),
  list: vi.fn(async () => []),
  get: vi.fn(async () => scheduledPlan()),
  updateSchedule: vi.fn(async (_user, _planId, draft, expectedVersion) => ({
    id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default' as const,
    title: 'Launch Longview', outcome: 'Release a tested PWA to real users.', why: 'Validate the product direction.',
    targetDate: '2026-08-20', ...draft, status: 'active' as const, schemaVersion: 2 as const,
    scheduleVersion: expectedVersion + 1
  }))
};

const scheduledPlan = (weeklyHours = 4): Plan => ({
  id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default' as const,
  title: 'Launch Longview', outcome: 'Release a tested PWA to real users.', why: 'Validate the product direction.',
  targetDate: '2026-08-20', weeklyHours, workingDays: ['mon'], status: 'active',
  schemaVersion: 2, scheduleVersion: 1
});

const todayGateway: TodayGateway = {
  get: vi.fn(async () => null),
  complete: vi.fn(async (user, step) => ({
    id: step.completionId, ownerUid: user.uid, workspaceId: 'default' as const, planId: step.planId,
    stepKey: 'first-proof-v1' as const, completedDate: step.date, durationMinutes: step.durationMinutes,
    status: 'completed' as const, schemaVersion: 1 as const
  }))
};

beforeEach(() => localStorage.clear());

function gateway(initial: AuthUser | null, failure?: { code: string }) {
  let listener: (user: AuthUser | null) => void = () => undefined;
  const mock: AuthGateway = {
    observe: vi.fn(next => { listener = next; queueMicrotask(() => next(initial)); return () => undefined; }),
    signInAnonymously: vi.fn(async () => {
      if (failure) throw failure;
      listener({ uid: 'anon-1', isAnonymous: true, displayName: null });
    }),
    signInGoogle: vi.fn(async () => { if (failure) throw failure; }),
    linkGoogle: vi.fn(async () => { if (failure) throw failure; }),
    signOut: vi.fn(async () => listener(null))
  };
  return mock;
}

describe('authentication journey', () => {
  it('continues anonymously and preserves the returned identity', async () => {
    const mock = gateway(null);
    render(<App gateway={mock} workspaceGateway={workspaceGateway} planGateway={planGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue anonymously' }));
    expect(await screen.findByText('You’re continuing privately.')).toBeVisible();
    expect(mock.signInAnonymously).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Continue setup' }));
    expect(await screen.findByRole('heading', { name: 'Nothing is scheduled yet.' })).toBeVisible();
  });

  it.each([
    ['auth/popup-closed-by-user', 'Sign-in was cancelled'],
    ['auth/popup-blocked', 'blocked the sign-in window'],
    ['auth/network-request-failed', 'appear to be offline']
  ])('recovers safely from %s', async (code, message) => {
    render(<App gateway={gateway(null, { code })} workspaceGateway={workspaceGateway} planGateway={planGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Continue anonymously' })).toBeEnabled();
  });

  it('keeps the anonymous workspace when account linking conflicts', async () => {
    const user = { uid: 'anon-1', isAnonymous: true, displayName: null };
    render(<App gateway={gateway(user, { code: 'auth/credential-already-in-use' })} workspaceGateway={workspaceGateway} planGateway={planGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Link Google account' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('workspace was not changed'));
    expect(screen.getByText('You’re continuing privately.')).toBeVisible();
  });

  it('offers retry without signing the user out when provisioning fails', async () => {
    const ensure = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'default', ownerUid: 'owner', schemaVersion: 1 });
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={{ ensure }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry workspace setup' }));
    expect(await screen.findByText('Welcome, Owner.')).toBeVisible();
    expect(ensure).toHaveBeenCalledTimes(2);
  });

  it('keeps the same workspace owner when an anonymous account is linked', async () => {
    let listener: (user: AuthUser | null) => void = () => undefined;
    const authGateway: AuthGateway = {
      observe(next) { listener = next; queueMicrotask(() => next({ uid: 'stable-uid', isAnonymous: true, displayName: null })); return () => undefined; },
      signInAnonymously: vi.fn(),
      signInGoogle: vi.fn(),
      linkGoogle: vi.fn(async () => listener({ uid: 'stable-uid', isAnonymous: false, displayName: 'Owner' })),
      signOut: vi.fn(async () => listener(null))
    };
    const ensure = vi.fn(async (user: AuthUser) => ({ id: 'default' as const, ownerUid: user.uid, schemaVersion: 1 as const }));
    render(<App gateway={authGateway} workspaceGateway={{ ensure }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Link Google account' }));
    expect(await screen.findByText('Welcome, Owner.')).toBeVisible();
    expect(ensure.mock.calls.map(([user]) => user.uid)).toEqual(['stable-uid', 'stable-uid']);
  });

  it('moves directly from workspace confirmation to Empty Today', async () => {
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={planGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue setup' }));
    expect(await screen.findByRole('heading', { name: 'Nothing is scheduled yet.' })).toBeVisible();
    expect(screen.queryByText(/workspace availability/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Account and privacy' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /availability/i })).not.toBeInTheDocument();
  });

  it('signs out from Settings without clearing saved onboarding', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const mock = gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' });
    render(<App gateway={mock} workspaceGateway={workspaceGateway} planGateway={planGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeVisible();
    expect(localStorage.getItem('longview:onboarding')).toBe('complete');
  });

  it('warns anonymous users and offers account linking before sign-out', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const mock = gateway({ uid: 'anon-1', isAnonymous: true, displayName: null });
    render(<App gateway={mock} workspaceGateway={workspaceGateway} planGateway={planGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('alert')).toHaveTextContent('won’t be able to return to this workspace');
    expect(screen.getByRole('button', { name: 'Link Google account' })).toBeVisible();
    expect(mock.signOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and lose access' }));
    expect(await screen.findByRole('button', { name: 'Continue anonymously' })).toBeVisible();
  });

  it('requires confirmation before clearing browser-local data', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const mock = gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' });
    render(<App gateway={mock} workspaceGateway={workspaceGateway} planGateway={planGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear this device' }));
    expect(screen.getByRole('alert')).toHaveTextContent('workspace will still be available');
    fireEvent.click(screen.getByRole('button', { name: 'Clear this device and sign out' }));
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeVisible();
    expect(localStorage.getItem('longview:onboarding')).toBeNull();
  });

  it('keeps Google linking available in Settings after anonymous onboarding', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const mock = gateway({ uid: 'anon-1', isAnonymous: true, displayName: null });
    render(<App gateway={mock} workspaceGateway={workspaceGateway} planGateway={planGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link Google account' }));
    expect(mock.linkGoogle).toHaveBeenCalledOnce();
  });

  it('explicitly switches to an existing Google workspace after a link conflict', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    let listener: (user: AuthUser | null) => void = () => undefined;
    const mock: AuthGateway = {
      observe(next) { listener = next; queueMicrotask(() => next({ uid: 'anon-1', isAnonymous: true, displayName: null })); return () => undefined; },
      signInAnonymously: vi.fn(),
      linkGoogle: vi.fn(async () => { throw { code: 'auth/credential-already-in-use' }; }),
      signInGoogle: vi.fn(async () => listener({ uid: 'google-1', isAnonymous: false, displayName: 'Owner' })),
      signOut: vi.fn()
    };
    render(<App gateway={mock} workspaceGateway={workspaceGateway} planGateway={planGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link Google account' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use existing Google workspace' }));
    await waitFor(() => expect(mock.signInGoogle).toHaveBeenCalledOnce());
    expect(screen.queryByRole('button', { name: 'Link Google account' })).not.toBeInTheDocument();
  });

  it('reviews and saves a valid Plan with a stable request id', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const create = vi.fn(planGateway.create);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, create }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create first Plan' }));
    fireEvent.change(screen.getByLabelText('Plan title'), { target: { value: '  Launch a useful product  ' } });
    fireEvent.change(screen.getByLabelText('Desired outcome'), { target: { value: 'Release a tested product to real users.' } });
    fireEvent.change(screen.getByLabelText('Why this matters'), { target: { value: 'Learn which problem is worth solving well.' } });
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2026-09-30' } });
    fireEvent.change(screen.getByLabelText('Hours for this Plan each week'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review Plan' }));
    expect(screen.getByRole('heading', { name: 'Launch a useful product' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));
    expect(await screen.findByText('Your Plan is ready. Longview will use it to shape your next useful step.')).toBeVisible();
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][1].clientRequestId).toBeTruthy();
  });

  it('starts a blank draft with a new request id after a Plan is saved', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const create = vi.fn(planGateway.create);
    const list = vi.fn(async () => [scheduledPlan()]);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, create, list }} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create Plan' }));
    fireEvent.change(screen.getByLabelText('Plan title'), { target: { value: 'First new Plan' } });
    fireEvent.change(screen.getByLabelText('Desired outcome'), { target: { value: 'Reach the first saved outcome.' } });
    fireEvent.change(screen.getByLabelText('Why this matters'), { target: { value: 'Keep the first reason with its Plan.' } });
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2026-09-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));
    expect(await screen.findByText('Your Plan is ready. Longview will use it to shape your next useful step.')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Return to Today' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create Plan' }));
    expect(screen.getByLabelText('Plan title')).toHaveValue('');
    expect(screen.getByLabelText('Desired outcome')).toHaveValue('');
    expect(screen.getByLabelText('Why this matters')).toHaveValue('');
    expect(screen.getByLabelText('Target date')).not.toHaveValue('2026-09-30');
    expect(screen.getByLabelText('Hours for this Plan each week')).toHaveValue(5);

    fireEvent.change(screen.getByLabelText('Plan title'), { target: { value: 'Second new Plan' } });
    fireEvent.change(screen.getByLabelText('Desired outcome'), { target: { value: 'Reach a distinct second outcome.' } });
    fireEvent.change(screen.getByLabelText('Why this matters'), { target: { value: 'Keep the second reason separate.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Plan title')).toHaveValue('Second new Plan');
    fireEvent.click(screen.getByRole('button', { name: 'Review Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[0][1].clientRequestId).not.toBe(create.mock.calls[1][1].clientRequestId);
  });

  it('keeps the same Plan request id when save is retried', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const create = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(planGateway.create);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, create }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create first Plan' }));
    fireEvent.change(screen.getByLabelText('Plan title'), { target: { value: 'Launch a useful product' } });
    fireEvent.change(screen.getByLabelText('Desired outcome'), { target: { value: 'Release a tested product to real users.' } });
    fireEvent.change(screen.getByLabelText('Why this matters'), { target: { value: 'Learn which problem is worth solving well.' } });
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2026-09-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('wasn’t saved');
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));
    expect(await screen.findByText('Your Plan is ready. Longview will use it to shape your next useful step.')).toBeVisible();
    expect(create.mock.calls[0][1].clientRequestId).toBe(create.mock.calls[1][1].clientRequestId);
  });

  it('requires at least one working day before reviewing a Plan', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const create = vi.fn(planGateway.create);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, create }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create first Plan' }));
    fireEvent.change(screen.getByLabelText('Plan title'), { target: { value: 'Launch a useful product' } });
    fireEvent.change(screen.getByLabelText('Desired outcome'), { target: { value: 'Release a tested product to real users.' } });
    fireEvent.change(screen.getByLabelText('Why this matters'), { target: { value: 'Learn which problem is worth solving well.' } });
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2026-09-30' } });
    for (const day of ['Mon', 'Wed', 'Fri']) fireEvent.click(screen.getByRole('button', { name: day }));
    fireEvent.click(screen.getByRole('button', { name: 'Review Plan' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one working day');
    expect(create).not.toHaveBeenCalled();
  });

  it('loads and presents owner Plans when the Plans tab opens', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [scheduledPlan(10)]);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={todayGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    expect(await screen.findByRole('heading', { name: 'Launch Longview' })).toBeVisible();
    expect(screen.getByText('Release a tested PWA to real users.')).toBeVisible();
    expect(screen.getAllByText('10 hours').length).toBeGreaterThan(0);
    expect(list).toHaveBeenCalledOnce();
  });

  it('summarizes finite portfolio allocation with deterministic modes and guidance', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const plans = [
      { ...scheduledPlan(2), id: 'house', clientRequestId: 'house', title: 'Build a House', targetDate: '2026-12-01' },
      { ...scheduledPlan(6), id: 'startup', clientRequestId: 'startup', title: 'Build a Startup', targetDate: '2026-09-01' },
      { ...scheduledPlan(4), id: 'learn', clientRequestId: 'learn', title: 'Learn AI', targetDate: '2026-10-01' }
    ];
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => plans) }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    expect(await screen.findByText('12 hours')).toBeVisible();
    expect(screen.getByText('Focus · 50% of committed time')).toBeVisible();
    expect(screen.getByText('Maintain · 33% of committed time')).toBeVisible();
    expect(screen.getByText('Prepare · 17% of committed time')).toBeVisible();
    expect(screen.getByText(/Protect Build a Startup, the nearest target/)).toBeVisible();
  });

  it('loads authoritative Plan Details and exposes honest context states', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const current = scheduledPlan();
    const get = vi.fn(async () => current);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [current]), get }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View Plan details' }));
    expect(await screen.findByRole('heading', { name: 'Plan overview' })).toBeVisible();
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ uid: 'owner' }), 'plan-1');
    expect(screen.getByText('20th August 2026')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Define the first proof of progress' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Decisions' }));
    expect(screen.getByText('No decisions have been recorded for this Plan yet.')).toBeVisible();
  });

  it('shows no stale details when the selected Plan is missing', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const current = scheduledPlan();
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [current]), get: vi.fn(async () => null) }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View Plan details' }));
    expect(await screen.findByRole('heading', { name: 'This Plan is no longer available.' })).toBeVisible();
    expect(screen.queryByText(current.outcome)).not.toBeInTheDocument();
  });

  it('retries a failed Plan Details read without changing the saved Plan', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const current = scheduledPlan();
    const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(current);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [current]), get }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View Plan details' }));
    expect(await screen.findByRole('heading', { name: 'Couldn’t load this Plan.' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Plan overview' })).toBeVisible();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('adds a schedule to an existing unscheduled Plan from Plan Details', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const legacy = { ...scheduledPlan(), workingDays: null, schemaVersion: 1 as const, scheduleVersion: 0 };
    const updateSchedule = vi.fn(async (_user, _planId, draft) => ({ ...legacy, ...draft, schemaVersion: 2 as const, scheduleVersion: 1 }));
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [legacy]), get: vi.fn(async () => legacy), updateSchedule }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View Plan details' }));
    expect(await screen.findByText('Schedule not set')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Add schedule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(await screen.findByText('Mon, Wed, Fri')).toBeVisible();
    expect(updateSchedule).toHaveBeenCalledWith(expect.objectContaining({ uid: 'owner' }), 'plan-1', expect.objectContaining({ workingDays: ['mon', 'wed', 'fri'] }), 0);
  });

  it('retains a Plan schedule draft after a failed save and retries safely', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const current = scheduledPlan();
    const updateSchedule = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(async (_user, _planId, draft) => ({ ...current, ...draft, scheduleVersion: 2 }));
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [current]), updateSchedule }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View Plan details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit schedule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('existing Plan is unchanged');
    expect(screen.getByRole('button', { name: 'Tue' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(await screen.findByText('Mon, Tue')).toBeVisible();
    expect(updateSchedule).toHaveBeenCalledTimes(2);
  });

  it('blocks a stale Plan schedule edit and offers reload', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const current = scheduledPlan();
    const updateSchedule = vi.fn(async () => { throw new PlanScheduleConflictError('stale'); });
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [current]), updateSchedule }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View Plan details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit schedule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('updated in another session');
    expect(screen.getByRole('button', { name: 'Reload Plan' })).toBeVisible();
  });

  it('shows the empty Plans action only after loading finishes', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    let resolve: (plans: []) => void = () => undefined;
    const list = vi.fn(() => new Promise<[]>((done) => { resolve = done; }));
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={todayGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    expect(screen.getByRole('heading', { name: 'Loading your Plans…' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'No Plans yet.' })).not.toBeInTheDocument();
    resolve([]);
    expect(await screen.findByRole('heading', { name: 'No Plans yet.' })).toBeVisible();
  });

  it('retries a failed Plans load without leaving the tab', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={todayGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    expect(await screen.findByRole('heading', { name: 'Your Plans couldn’t be loaded.' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'No Plans yet.' })).toBeVisible();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('prepares one deterministic Today step from a saved Plan', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [scheduledPlan(3)]);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} />);
    expect(await screen.findByRole('heading', { name: 'One useful step is enough.' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Define the first proof of progress' })).toBeVisible();
    expect(screen.getByText('45 minutes')).toBeVisible();
    expect(screen.getByText('From Launch Longview')).toBeVisible();
  });

  it('requires confirmation before recording Today completion', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [scheduledPlan()]);
    const complete = vi.fn(todayGateway.complete);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={{ get: vi.fn(async () => null), complete }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark step complete' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Plan and schedule will stay the same');
    expect(complete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep working' }));
    expect(screen.getByRole('button', { name: 'Mark step complete' })).toBeVisible();
    expect(complete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark step complete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm completion' }));
    expect(await screen.findByRole('heading', { name: 'Today’s step is complete.' })).toBeVisible();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('keeps the same completion id when a failed save is retried', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [scheduledPlan()]);
    const complete = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(todayGateway.complete);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={{ get: vi.fn(async () => null), complete }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark step complete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm completion' }));
    expect(await screen.findByText('Completion wasn’t saved. Your step is still open. Try again.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm completion' }));
    expect(await screen.findByRole('heading', { name: 'Today’s step is complete.' })).toBeVisible();
    expect(complete.mock.calls[0][1].completionId).toBe(complete.mock.calls[1][1].completionId);
  });

  it('restores a previously completed Today step', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const saved = {
      id: '2026-08-17_plan-1_first-proof-v1', ownerUid: 'owner', workspaceId: 'default' as const,
      planId: 'plan-1', stepKey: 'first-proof-v1' as const, completedDate: '2026-08-17',
      durationMinutes: 60, status: 'completed' as const, schemaVersion: 1 as const
    };
    const list = vi.fn(async () => [scheduledPlan()]);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={{ get: vi.fn(async () => saved), complete: vi.fn(todayGateway.complete) }} />);
    expect(await screen.findByRole('heading', { name: 'Today’s step is complete.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mark step complete' })).not.toBeInTheDocument();
  });

  it('retries completion-state loading without changing the step', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [scheduledPlan()]);
    const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={{ get, complete: vi.fn(todayGateway.complete) }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Progress couldn’t be checked');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Mark step complete' })).toBeVisible();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('shows a scoped read-only Clara recommendation without writing', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [scheduledPlan()]);
    let finishRecommendation: () => void = () => undefined;
    const recommend = vi.fn(context => new Promise(resolve => {
      finishRecommendation = () => resolve({
        schemaVersion: 1, requestId: context.requestId, sourcePlanId: context.plan.id,
        headline: 'Protect the smallest proof', recommendation: 'Finish this step before adding new work.',
        rationale: 'It creates evidence for the nearest active target.', confidence: 'medium',
        requiresClarification: false, sourceFacts: ['Plan: Launch Longview', 'Today step: 60 minutes'], proposedChange: null
      });
    }));
    const complete = vi.fn(todayGateway.complete);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={{ get: vi.fn(async () => null), complete }} claraGateway={{ recommend }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Clara about this step' }));
    const progress = await screen.findByRole('progressbar', { name: 'Waiting for Clara' });
    expect(progress).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByRole('button', { name: 'Cancel and return' })).toBeVisible();
    finishRecommendation();
    expect(await screen.findByRole('heading', { name: 'Protect the smallest proof' })).toBeVisible();
    expect(screen.queryByRole('progressbar', { name: 'Waiting for Clara' })).not.toBeInTheDocument();
    expect(screen.getByText('Recommendation only · Nothing was changed.')).toBeVisible();
    expect(recommend.mock.calls[0][0].plan).toMatchObject({ id: 'plan-1', title: 'Launch Longview' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('fails closed on invalid Clara output and retries safely', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [scheduledPlan()]);
    const recommend = vi.fn().mockResolvedValueOnce({ proposedChange: { unsafe: true } }).mockImplementation(async context => ({
      schemaVersion: 1, requestId: context.requestId, sourcePlanId: context.plan.id,
      headline: 'Protect the smallest proof', recommendation: 'Finish this step before adding new work.',
      rationale: 'It creates evidence for the nearest active target.', confidence: 'medium',
      requiresClarification: false, sourceFacts: ['Plan: Launch Longview'], proposedChange: null
    }));
    const claraGateway: ClaraGateway = { recommend };
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={todayGateway} claraGateway={claraGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Clara about this step' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('response could not be used');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Protect the smallest proof' })).toBeVisible();
    expect(recommend).toHaveBeenCalledTimes(2);
  });

  it('previews and applies one approved Plan schedule change before refreshing Today', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const initial = scheduledPlan();
    const updated = { ...initial, workingDays: ['mon', 'wed'] as const, scheduleVersion: 2 };
    const list = vi.fn().mockResolvedValueOnce([initial]).mockResolvedValue([updated]);
    const recommend = vi.fn(async context => ({
      schemaVersion: 1, requestId: context.requestId, sourcePlanId: context.plan.id,
      headline: 'Add a midweek checkpoint', recommendation: 'Use Wednesday to keep progress moving.',
      rationale: 'The current gap between working days is unnecessarily long.', confidence: 'medium',
      requiresClarification: false, sourceFacts: ['Working days: Monday'],
      proposedChange: {
        kind: 'plan-working-days', planId: 'plan-1', expectedScheduleVersion: 1,
        workingDaysBefore: ['mon'], workingDaysAfter: ['mon', 'wed'], weeklyHours: 4,
        rationale: 'A midweek checkpoint reduces the gap between sessions.',
        downstreamEffect: 'Today can select this Plan on Wednesday without changing weekly time.'
      }
    }));
    const apply = vi.fn(async (_proposal, idempotencyKey) => ({
      schemaVersion: 1 as const, idempotencyKey, planId: 'plan-1', scheduleVersion: 2,
      workingDays: ['mon', 'wed'] as ('mon' | 'wed')[], weeklyHours: 4, auditEventId: idempotencyKey, duplicate: false
    }));
    const claraApprovalGateway: ClaraApprovalGateway = { apply };
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={todayGateway} claraGateway={{ recommend }} claraApprovalGateway={claraApprovalGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Clara about this step' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review schedule change' }));
    expect(screen.getByText('Mon')).toBeVisible();
    expect(screen.getByText('Mon, Wed')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Approve schedule change' }));
    expect(await screen.findByRole('heading', { name: 'Schedule change approved' })).toBeVisible();
    expect(apply).toHaveBeenCalledOnce();
    expect(apply.mock.calls[0][0]).toMatchObject({ expectedScheduleVersion: 1, weeklyHours: 4 });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('rejects Clara’s preview without applying or refreshing the Plan', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [scheduledPlan()]);
    const recommend = vi.fn(async context => ({
      schemaVersion: 1, requestId: context.requestId, sourcePlanId: context.plan.id,
      headline: 'Add a midweek checkpoint', recommendation: 'Use Wednesday to keep progress moving.',
      rationale: 'The current gap between working days is unnecessarily long.', confidence: 'medium',
      requiresClarification: false, sourceFacts: ['Working days: Monday'], proposedChange: {
        kind: 'plan-working-days', planId: 'plan-1', expectedScheduleVersion: 1,
        workingDaysBefore: ['mon'], workingDaysAfter: ['mon', 'wed'], weeklyHours: 4,
        rationale: 'A midweek checkpoint reduces the gap between sessions.',
        downstreamEffect: 'Today can select this Plan on Wednesday without changing weekly time.'
      }
    }));
    const apply = vi.fn();
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={todayGateway} claraGateway={{ recommend }} claraApprovalGateway={{ apply }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Clara about this step' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review schedule change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject and keep current schedule' }));
    expect(await screen.findByRole('button', { name: 'Ask Clara about this step' })).toBeVisible();
    expect(apply).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledTimes(2);
  });
});
