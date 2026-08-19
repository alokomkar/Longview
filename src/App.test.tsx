import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { App as LongviewApp } from './App';
import type { AuthGateway, AuthUser } from './auth/types';
import type { WorkspaceGateway } from './workspace/types';
import { PlanScheduleConflictError, type Plan, type PlanGateway } from './plan/types';
import type { TodayGateway } from './today/types';
import { pendingCompletionFromStep, type TodayOutbox, type TodayPendingCompletion } from './today/outbox';
import type { ClaraGateway } from './clara/types';
import { ClaraApprovalConflictError, type ClaraApprovalGateway } from './clara/approvalTypes';
import type { ScheduleRunGateway } from './scheduleRun/types';
import { ApprovedDayConflictError, type ApprovedDay, type ApprovedDayGateway, type DayApprovalRequest, type DayApprovalResult } from './approvedDay/types';
import { DayBreakConflictError, type DayBreakGateway, type DayBreakPreview, type DayBreakRequest, type DayBreakResult } from './dayBreak/types';

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
    completion: {
      id: step.completionId, ownerUid: user.uid, workspaceId: 'default' as const, planId: step.planId,
      stepKey: 'first-proof-v1' as const, completedDate: step.date, durationMinutes: step.durationMinutes,
      status: 'completed' as const, schemaVersion: 1 as const
    },
    duplicate: false
  }))
};

const todayOutbox: TodayOutbox = {
  get: vi.fn(async () => null),
  put: vi.fn(async (user, step) => pendingCompletionFromStep(user, step)),
  recordFailure: vi.fn(async (user, step, failure) => ({ ...pendingCompletionFromStep(user, step), attemptCount: 1, lastFailure: failure } as TodayPendingCompletion)),
  remove: vi.fn(async () => undefined),
  clearOwner: vi.fn(async () => undefined)
};

function statefulTodayOutbox() {
  let pending: TodayPendingCompletion | null = null;
  const outbox: TodayOutbox = {
    get: vi.fn(async (user, step) => pending && pending.ownerUid === user.uid && pending.completion.id === step.completionId ? pending : null),
    put: vi.fn(async (user, step) => {
      pending ??= pendingCompletionFromStep(user, step, 1);
      return pending;
    }),
    recordFailure: vi.fn(async (_user, _step, failure) => {
      if (!pending) throw new Error('missing');
      pending = { ...pending, attemptCount: pending.attemptCount + 1, lastFailure: failure };
      return pending;
    }),
    remove: vi.fn(async () => { pending = null; }),
    clearOwner: vi.fn(async ownerUid => { if (pending?.ownerUid === ownerUid) pending = null; })
  };
  return outbox;
}

const approvedDayGateway: ApprovedDayGateway = {
  get: vi.fn(async () => null),
  approve: vi.fn(async () => { throw new Error('not configured'); })
};

function App(props: ComponentProps<typeof LongviewApp>) {
  return <LongviewApp approvedDayGateway={approvedDayGateway} todayOutbox={todayOutbox} {...props} />;
}

const succeededScheduleRun = {
  schemaVersion: 1 as const, runId: 'run-1', requestId: 'schedule-request-1', selectedDate: '2026-08-17',
  status: 'succeeded' as const, checkpoint: 4 as const, checkpointLabel: 'Result published', retryOf: null, failure: null,
  proposal: { selectedDate: '2026-08-17', capacityMinutes: 120, totalMinutes: 60,
    rationale: 'The nearest active target comes first within capacity.',
    blocks: [{ planId: 'plan-1', planTitle: 'Launch Longview', title: 'Define the first proof', durationMinutes: 60 }] }
};

const savedApprovedDay: ApprovedDay = {
  schemaVersion: 1, selectedDate: '2026-08-17', revision: 1, sourceRunId: 'run-1',
  capacityMinutes: 120, totalMinutes: 60, status: 'approved', approvalEventId: 'day-approval-1',
  blocks: [{ order: 1, planId: 'plan-1', planTitle: 'Launch Longview', title: 'Define the first proof', durationMinutes: 60 }]
};

const dayBreakPreview: DayBreakPreview = {
  schemaVersion: 1, selectedDate: '2026-08-17', expectedDayRevision: 1, sourceApprovalEventId: 'day-approval-1',
  carryovers: [{ order: 1, planId: 'plan-1', planTitle: 'Launch Longview', title: 'Define the first proof', durationMinutes: 60, destinationDate: '2026-08-18', scheduleVersion: 1 }]
};
const savedBreakDay: ApprovedDay = {
  ...savedApprovedDay, revision: 2, status: 'break', breakEventId: 'day-break-1', carryoverCount: 1
};

beforeEach(() => {
  localStorage.clear();
  vi.setSystemTime(new Date('2026-08-17T12:00:00'));
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

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
    expect(screen.getByText(/Completion record: 2026-08-17_plan-1_first-proof-v1/)).toBeVisible();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('shows the original proof when completion was already recorded', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const complete = vi.fn(async (...args: Parameters<TodayGateway['complete']>) => ({
      ...(await todayGateway.complete(...args)), duplicate: true
    }));
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get: vi.fn(async () => null), complete }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark step complete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm completion' }));
    expect(await screen.findByRole('heading', { name: 'Progress already saved.' })).toBeVisible();
    expect(screen.getByText('That progress was already saved. No second completion was added and your Plan was not changed.')).toBeVisible();
    expect(screen.getByText('One completion record remains.')).toBeVisible();
    expect(screen.getByText(/Completion record: 2026-08-17_plan-1_first-proof-v1/)).toBeVisible();
  });

  it('matches the approved offline, syncing, and duplicate completion journey', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    let release!: () => void;
    const complete = vi.fn((user: AuthUser, step: Parameters<TodayGateway['complete']>[1]) => new Promise<Awaited<ReturnType<TodayGateway['complete']>>>(resolve => {
      release = () => resolve({
        completion: { ...pendingCompletionFromStep(user, step).completion },
        duplicate: true
      });
    }));
    const outbox = statefulTodayOutbox();
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get: vi.fn(), complete }} todayOutbox={outbox} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Mark step complete' }));
    expect(screen.getByRole('alert')).toHaveTextContent('sync it after your connection returns');
    fireEvent.click(screen.getByRole('button', { name: 'Save on this device' }));
    expect(await screen.findByRole('heading', { name: 'Saved on this device' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting to sync');
    expect(complete).not.toHaveBeenCalled();

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    act(() => globalThis.dispatchEvent(new Event('online')));
    expect(await screen.findByRole('heading', { name: 'Syncing your completion' })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Syncing completion' })).toBeVisible();
    expect(complete).toHaveBeenCalledOnce();
    await act(async () => release());
    expect(await screen.findByRole('heading', { name: 'Progress already saved.' })).toBeVisible();
    await waitFor(() => expect(outbox.remove).toHaveBeenCalledOnce());
  });

  it('keeps the same completion id when a failed network save is queued and retried', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [scheduledPlan()]);
    const complete = vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(todayGateway.complete);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={{ get: vi.fn(async () => null), complete }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark step complete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm completion' }));
    expect(await screen.findByRole('heading', { name: 'Still waiting to sync' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try sync again' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Ask Clara' }));
    expect(screen.getByRole('heading', { name: 'Choose how Clara can help with Today.' })).toBeVisible();
  });

  it('shows a finished-for-today Calendar state when every scheduled step is complete', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const saved = {
      id: '2026-08-17_plan-1_first-proof-v1', ownerUid: 'owner', workspaceId: 'default' as const,
      planId: 'plan-1', stepKey: 'first-proof-v1' as const, completedDate: '2026-08-17',
      durationMinutes: 60, status: 'completed' as const, schemaVersion: 1 as const
    };
    const start = vi.fn();
    const scheduleRunGateway = { start, get: vi.fn(), cancel: vi.fn() } as unknown as ScheduleRunGateway;
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get: vi.fn(async () => saved), complete: vi.fn(todayGateway.complete) }} scheduleRunGateway={scheduleRunGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
    expect(await screen.findByRole('heading', { name: 'You’re done for today.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Prepare today' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create another Plan' })).toBeVisible();
    expect(start).not.toHaveBeenCalled();
  });

  it('excludes a completed Plan step while preparing remaining work', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const first = scheduledPlan();
    const second = { ...scheduledPlan(2), id: 'plan-2', clientRequestId: 'plan-2', title: 'Prepare launch evidence', targetDate: '2026-08-25' };
    const get = vi.fn(async (_user: Parameters<TodayGateway['get']>[0], step: Parameters<TodayGateway['get']>[1]) => step.planId === 'plan-1' ? {
      id: step.completionId, ownerUid: 'owner', workspaceId: 'default' as const, planId: step.planId,
      stepKey: 'first-proof-v1' as const, completedDate: step.date, durationMinutes: step.durationMinutes,
      status: 'completed' as const, schemaVersion: 1 as const
    } : null);
    const start = vi.fn((_context: Parameters<ScheduleRunGateway['start']>[0], _signal: AbortSignal) => new Promise<never>(() => undefined));
    const scheduleRunGateway = { start, get: vi.fn(), cancel: vi.fn() } as unknown as ScheduleRunGateway;
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [first, second]) }} todayGateway={{ get, complete: vi.fn(todayGateway.complete) }} scheduleRunGateway={scheduleRunGateway} approvedDayGateway={approvedDayGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare today' }));
    await waitFor(() => expect(start).toHaveBeenCalledOnce());
    expect(start.mock.calls[0][0].steps.map(step => step.planId)).toEqual(['plan-2']);
  });

  it('does not prepare Calendar when completion checks fail', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const get = vi.fn().mockResolvedValueOnce(null).mockRejectedValue(new Error('offline'));
    const start = vi.fn();
    const scheduleRunGateway = { start, get: vi.fn(), cancel: vi.fn() } as unknown as ScheduleRunGateway;
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get, complete: vi.fn(todayGateway.complete) }} scheduleRunGateway={scheduleRunGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
    expect(await screen.findByRole('heading', { name: 'Today’s progress could not be checked.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Prepare today' })).not.toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });

  it('restores an approved day from the owner-scoped service', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const get = vi.fn(async () => savedApprovedDay);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get: vi.fn(async () => null), complete: vi.fn(todayGateway.complete) }} approvedDayGateway={{ get, approve: vi.fn() }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
    expect(await screen.findByRole('heading', { name: '17th August 2026 is ready.' })).toBeVisible();
    expect(screen.getByText('Approved day · revision 1')).toBeVisible();
    expect(screen.getByText('run-1')).toBeVisible();
    expect(get).toHaveBeenCalledWith('2026-08-17', expect.any(AbortSignal));
  });

  it('keeps approval progress visible and shows the committed day', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    let finish: () => void = () => undefined;
    const approve = vi.fn((_runId: string, request: DayApprovalRequest, _signal: AbortSignal) => new Promise<DayApprovalResult>(resolve => {
      finish = () => resolve({ schemaVersion: 1, idempotencyKey: request.idempotencyKey, duplicate: false, approvedDay: savedApprovedDay });
    }));
    const scheduleRunGateway: ScheduleRunGateway = { start: vi.fn(async () => succeededScheduleRun), get: vi.fn(), cancel: vi.fn() };
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get: vi.fn(async () => null), complete: vi.fn(todayGateway.complete) }} scheduleRunGateway={scheduleRunGateway} approvedDayGateway={{ get: vi.fn(async () => null), approve }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare today' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve this order' }));
    expect(screen.getByRole('progressbar', { name: 'Saving approved day' })).toBeVisible();
    finish();
    expect(await screen.findByRole('heading', { name: '17th August 2026 is ready.' })).toBeVisible();
    expect(screen.queryByRole('progressbar', { name: 'Saving approved day' })).not.toBeInTheDocument();
    expect(approve.mock.calls[0][1]).toMatchObject({ expectedDayRevision: 0, replaceCurrent: false });
  });

  it.each([
    [new Error('offline'), 'Today was not changed.', 'Try approval again'],
    [new ApprovedDayConflictError('changed'), 'This proposal is out of date.', 'Review latest day']
  ])('preserves the previous approved day when replacement fails', async (failure, heading, action) => {
    localStorage.setItem('longview:onboarding', 'complete');
    const approve = vi.fn(async (_runId: string, _request: DayApprovalRequest, _signal: AbortSignal): Promise<DayApprovalResult> => { throw failure; });
    const scheduleRunGateway: ScheduleRunGateway = { start: vi.fn(async () => ({ ...succeededScheduleRun, runId: 'run-2' })), get: vi.fn(), cancel: vi.fn() };
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get: vi.fn(async () => null), complete: vi.fn(todayGateway.complete) }} scheduleRunGateway={scheduleRunGateway} approvedDayGateway={{ get: vi.fn(async () => savedApprovedDay), approve }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare replacement' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Replace approved day' }));
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    expect(screen.getByRole('button', { name: action })).toBeVisible();
    expect(approve.mock.calls[0][1]).toMatchObject({ expectedDayRevision: 1, replaceCurrent: true });
  });

  it('reviews and atomically confirms a Calendar day break with progress', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    let finish: () => void = () => undefined;
    const confirm = vi.fn((_date: string, request: DayBreakRequest, _signal: AbortSignal) => new Promise<DayBreakResult>(resolve => {
      finish = () => resolve({ schemaVersion: 1, idempotencyKey: request.idempotencyKey, duplicate: false, breakDay: savedBreakDay, carryovers: dayBreakPreview.carryovers });
    }));
    const dayBreakGateway: DayBreakGateway = { preview: vi.fn(async () => dayBreakPreview), confirm };
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get: vi.fn(async () => null), complete: vi.fn(todayGateway.complete) }} approvedDayGateway={{ get: vi.fn(async () => savedApprovedDay), approve: vi.fn() }} dayBreakGateway={dayBreakGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Take a break today' }));
    expect(await screen.findByText('Future days will not be approved or overwritten.')).toBeVisible();
    expect(screen.getByText('18th August 2026')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm break and carry tasks' }));
    expect(screen.getByRole('progressbar', { name: 'Saving day break' })).toBeVisible();
    finish();
    expect(await screen.findByRole('heading', { name: '17th August 2026 is marked as a break.' })).toBeVisible();
    expect(screen.getByText('No future day was approved or overwritten.')).toBeVisible();
  });

  it.each([
    [new DayBreakConflictError('future-approved'), 'No future day was overwritten.'],
    [new DayBreakConflictError('no-eligible-day'), 'One task has no eligible future day.'],
    [new DayBreakConflictError('source-changed'), 'This break preview is out of date.']
  ])('preserves today when the break preview fails', async (failure, heading) => {
    localStorage.setItem('longview:onboarding', 'complete');
    const dayBreakGateway: DayBreakGateway = { preview: vi.fn(async () => { throw failure; }), confirm: vi.fn() };
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get: vi.fn(async () => null), complete: vi.fn(todayGateway.complete) }} approvedDayGateway={{ get: vi.fn(async () => savedApprovedDay), approve: vi.fn() }} dayBreakGateway={dayBreakGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Take a break today' }));
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keep today’s order' })).toBeVisible();
    expect(dayBreakGateway.confirm).not.toHaveBeenCalled();
  });

  it('restores a saved break without offering another proposal', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get: vi.fn(async () => null), complete: vi.fn(todayGateway.complete) }} approvedDayGateway={{ get: vi.fn(async () => savedBreakDay), approve: vi.fn() }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
    expect(await screen.findByRole('heading', { name: '17th August 2026 is marked as a break.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Prepare replacement' })).not.toBeInTheDocument();
    expect(screen.getByText('day-break-1')).toBeVisible();
  });

  it('restores a saved break on Today without exposing stale task actions', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const getCompletion = vi.fn(async () => null);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get: getCompletion, complete: vi.fn(todayGateway.complete) }} approvedDayGateway={{ get: vi.fn(async () => savedBreakDay), approve: vi.fn() }} />);
    expect(await screen.findByRole('heading', { name: 'You’re taking a break today.' })).toBeVisible();
    expect(screen.getByText(/Your unfinished task will be offered again on its next scheduled Plan day/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mark step complete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask Clara about this step' })).not.toBeInTheDocument();
    expect(getCompletion).not.toHaveBeenCalled();
  });

  it('refreshes the approved day before returning from a saved break to Today', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const get = vi.fn().mockResolvedValueOnce(savedApprovedDay).mockResolvedValue(savedBreakDay);
    const dayBreakGateway: DayBreakGateway = {
      preview: vi.fn(async () => dayBreakPreview),
      confirm: vi.fn(async (_date, request): Promise<DayBreakResult> => ({ schemaVersion: 1, idempotencyKey: request.idempotencyKey, duplicate: false, breakDay: savedBreakDay, carryovers: dayBreakPreview.carryovers }))
    };
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get: vi.fn(async () => null), complete: vi.fn(todayGateway.complete) }} approvedDayGateway={{ get, approve: vi.fn() }} dayBreakGateway={dayBreakGateway} />);
    await screen.findByRole('button', { name: 'Mark step complete' });
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Take a break today' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm break and carry tasks' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Return to Today' }));
    expect(await screen.findByRole('heading', { name: 'You’re taking a break today.' })).toBeVisible();
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Mark step complete' })).not.toBeInTheDocument();
  });

  it('hides Today actions until an unavailable day-status check succeeds', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(savedBreakDay);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }} todayGateway={{ get: vi.fn(async () => null), complete: vi.fn(todayGateway.complete) }} approvedDayGateway={{ get, approve: vi.fn() }} />);
    expect(await screen.findByRole('heading', { name: 'Today’s schedule couldn’t be checked.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mark step complete' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'You’re taking a break today.' })).toBeVisible();
    expect(get).toHaveBeenCalledTimes(2);
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

  it('opens bounded Clara Quick Actions without starting a network run or write', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [scheduledPlan()]);
    const start = vi.fn();
    const recommend = vi.fn();
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={todayGateway} claraGateway={{ recommend }} scheduleRunGateway={{ start, get: vi.fn(), cancel: vi.fn() }} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ask Clara' }));
    expect(screen.getByRole('heading', { name: 'Choose how Clara can help with Today.' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Quick Actions/ }));
    expect(screen.getByText('Safe by default')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Plan my day/ }));
    expect(screen.getByRole('heading', { name: 'Plan my day' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Build today’s schedule/ }));

    expect(await screen.findByRole('button', { name: 'Prepare today' })).toBeVisible();
    expect(start).not.toHaveBeenCalled();
    expect(recommend).not.toHaveBeenCalled();
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

  it('offers Plan creation from Calendar when the portfolio is empty', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => []);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
    expect(await screen.findByRole('heading', { name: 'Nothing is planned for today.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Prepare today' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create a Plan' }));
    expect(screen.getByLabelText('Plan title')).toHaveValue('');
  });

  it('offers schedule review when Plans exist but none is eligible today', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [{ ...scheduledPlan(), workingDays: undefined }]);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
    expect(await screen.findByRole('heading', { name: 'Nothing is planned for today.' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create another Plan' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Review Plan schedules' }));
    expect(await screen.findByRole('heading', { name: 'Your Plans' })).toBeVisible();
  });
});

describe('Phase 0 release surface', () => {
  it('completes the core Today flow without calling unfinished scheduling or Clara services', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const getApprovedDay = vi.fn(async () => { throw new Error('service unavailable'); });
    const recommend = vi.fn();
    const complete = vi.fn(todayGateway.complete);

    render(<App
      releaseSurface="phase-zero"
      gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })}
      workspaceGateway={workspaceGateway}
      planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }}
      todayGateway={{ get: vi.fn(async () => null), complete }}
      claraGateway={{ recommend }}
      approvedDayGateway={{ get: getApprovedDay, approve: vi.fn() }}
    />);

    await waitFor(() => expect(screen.getByText('Early access')).toBeVisible());
    expect(screen.getByRole('heading', { name: 'One useful step is enough.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Calendar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ask Clara/ })).not.toBeInTheDocument();
    expect(getApprovedDay).not.toHaveBeenCalled();
    expect(recommend).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'Mark step complete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm completion' }));

    expect(await screen.findByRole('heading', { name: 'Today’s step is complete.' })).toBeVisible();
    expect(complete).toHaveBeenCalledOnce();
  });
});

describe('Release 1 Ask Clara surface', () => {
  it('shows read-only step guidance without loading Calendar or approvals', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const getApprovedDay = vi.fn();
    const apply = vi.fn();
    const recommend = vi.fn(async context => ({
      schemaVersion: 1, requestId: context.requestId, sourcePlanId: context.plan.id,
      headline: 'Protect the smallest proof', recommendation: 'Finish this step before adding new work.',
      rationale: 'It creates evidence for the nearest active target.', confidence: 'medium',
      requiresClarification: false, sourceFacts: ['Plan: Launch Longview'], proposedChange: null
    }));
    render(<App
      releaseSurface="release-one"
      gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })}
      workspaceGateway={workspaceGateway}
      planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }}
      todayGateway={todayGateway}
      claraGateway={{ recommend }}
      claraApprovalGateway={{ apply }}
      approvedDayGateway={{ get: getApprovedDay, approve: vi.fn() }}
    />);
    expect(await screen.findByText('Ask Clara · read only')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Calendar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask Clara' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Clara about this step' }));
    expect(await screen.findByRole('heading', { name: 'Protect the smallest proof' })).toBeVisible();
    expect(recommend.mock.calls[0][0]).toMatchObject({ scope: 'today-step' });
    expect(getApprovedDay).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('asks about a Plan without attaching a fabricated step', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const recommend = vi.fn(async context => ({
      schemaVersion: 1, requestId: context.requestId, sourcePlanId: context.plan.id,
      headline: 'Define one proof', recommendation: 'Name one result that demonstrates meaningful progress.',
      rationale: 'The Plan has a clear outcome but needs a measurable proof.', confidence: 'low',
      requiresClarification: true, sourceFacts: ['Plan: Launch Longview'], proposedChange: null
    }));
    render(<App
      releaseSurface="release-one"
      gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })}
      workspaceGateway={workspaceGateway}
      planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }}
      claraGateway={{ recommend }}
    />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View Plan details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Clara about this Plan' }));
    expect(await screen.findByRole('heading', { name: 'Define one proof' })).toBeVisible();
    expect(recommend.mock.calls[0][0]).toMatchObject({ scope: 'plan' });
    expect(recommend.mock.calls[0][0]).not.toHaveProperty('step');
  });
});

describe('Release 2 Clara schedule review surface', () => {
  const proposalResponse = (context: Parameters<ClaraGateway['recommend']>[0]) => ({
    schemaVersion: 1 as const, requestId: context.requestId, sourcePlanId: context.plan.id,
    headline: 'Add a midweek checkpoint', recommendation: 'Use Wednesday to keep progress moving.',
    rationale: 'The current gap between working days is unnecessarily long.', confidence: 'medium' as const,
    requiresClarification: false, sourceFacts: ['Working days: Monday'], proposedChange: {
      kind: 'plan-working-days' as const, planId: 'plan-1', expectedScheduleVersion: 1,
      workingDaysBefore: ['mon'] as const, workingDaysAfter: ['mon', 'wed'] as const, weeklyHours: 4,
      rationale: 'A midweek checkpoint reduces the gap between sessions.',
      downstreamEffect: 'Today can select this Plan on Wednesday without changing weekly time.'
    }
  });
  const approvalResult = (key: string, duplicate = false) => ({
    schemaVersion: 1 as const, idempotencyKey: key, planId: 'plan-1', scheduleVersion: 2,
    workingDays: ['mon', 'wed'] as ('mon' | 'wed')[], weeklyHours: 4,
    auditEventId: key, duplicate
  });

  it('shows exact values, keeps progress visible, and exposes the audit record after approval', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    let finish: (value: ReturnType<typeof approvalResult>) => void = () => undefined;
    const apply = vi.fn((_proposal, key: string) => new Promise<ReturnType<typeof approvalResult>>(resolve => { finish = resolve; }));
    render(<App
      releaseSurface="release-two"
      gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })}
      workspaceGateway={workspaceGateway}
      planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }}
      todayGateway={todayGateway}
      claraGateway={{ recommend: vi.fn(async context => proposalResponse(context)) }}
      claraApprovalGateway={{ apply }}
    />);
    expect(await screen.findByText('Clara changes · review first')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Calendar' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Clara about this step' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review schedule change' }));
    expect(screen.getByText('Mon, Wed')).toBeVisible();
    expect(screen.getByText('4 hours/week · version 1')).toBeVisible();
    expect(screen.getByText(/Today can select this Plan on Wednesday/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Approve schedule change' }));
    expect(screen.getByRole('progressbar', { name: 'Saving approved change' })).toBeVisible();
    const key = apply.mock.calls[0][1];
    finish(approvalResult(key));
    expect(await screen.findByRole('heading', { name: 'Schedule change approved' })).toBeVisible();
    expect(screen.getByText(key)).toBeVisible();
  });

  it('rejects without writing and retries a network failure with the same idempotency key', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const apply = vi.fn().mockRejectedValueOnce(new Error('network')).mockImplementation(async (_proposal, key) => approvalResult(key));
    render(<App
      releaseSurface="release-two"
      gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })}
      workspaceGateway={workspaceGateway}
      planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }}
      todayGateway={todayGateway}
      claraGateway={{ recommend: vi.fn(async context => proposalResponse(context)) }}
      claraApprovalGateway={{ apply }}
    />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Clara about this step' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review schedule change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject and keep current schedule' }));
    expect(await screen.findByRole('button', { name: 'Ask Clara about this step' })).toBeVisible();
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ask Clara about this step' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review schedule change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve schedule change' }));
    expect(await screen.findByRole('heading', { name: 'The schedule change wasn’t saved.' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try approval again' }));
    expect(await screen.findByRole('heading', { name: 'Schedule change approved' })).toBeVisible();
    expect(apply.mock.calls[1][1]).toBe(apply.mock.calls[0][1]);
  });

  it('fails a stale approval without showing an applied state', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const apply = vi.fn(async () => { throw new ClaraApprovalConflictError('stale'); });
    render(<App
      releaseSurface="release-two"
      gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })}
      workspaceGateway={workspaceGateway}
      planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }}
      todayGateway={todayGateway}
      claraGateway={{ recommend: vi.fn(async context => proposalResponse(context)) }}
      claraApprovalGateway={{ apply }}
    />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Clara about this step' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review schedule change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve schedule change' }));
    expect(await screen.findByRole('heading', { name: 'This preview is out of date.' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Schedule change approved' })).not.toBeInTheDocument();
  });
});

describe('Release 3 daily schedule surface', () => {
  it('exposes the bounded Calendar journey without exposing unrelated agent navigation', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const approve = vi.fn(async (_runId: string, request: DayApprovalRequest) => ({
      schemaVersion: 1 as const, idempotencyKey: request.idempotencyKey, duplicate: false, approvedDay: savedApprovedDay
    }));
    const scheduleRunGateway: ScheduleRunGateway = {
      start: vi.fn(async () => succeededScheduleRun), get: vi.fn(), cancel: vi.fn()
    };
    render(<App
      releaseSurface="release-three"
      gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })}
      workspaceGateway={workspaceGateway}
      planGateway={{ ...planGateway, list: vi.fn(async () => [scheduledPlan()]) }}
      todayGateway={{ get: vi.fn(async () => null), complete: vi.fn(todayGateway.complete) }}
      scheduleRunGateway={scheduleRunGateway}
      approvedDayGateway={{ get: vi.fn(async () => null), approve }}
    />);
    expect(await screen.findByText('Daily schedule · review first')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ask Clara' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare today' }));
    expect(await screen.findByRole('heading', { name: 'A workable order for today.' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Approve this order' }));
    expect(await screen.findByRole('heading', { name: '17th August 2026 is ready.' })).toBeVisible();
    expect(approve).toHaveBeenCalledOnce();
  });
});
