import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AuthGateway, AuthUser } from './auth/types';
import type { WorkspaceGateway } from './workspace/types';
import type { PlanGateway } from './plan/types';
import type { TodayGateway } from './today/types';
import type { ClaraGateway } from './clara/types';

const workspaceGateway: WorkspaceGateway = {
  ensure: vi.fn(async (user: AuthUser) => ({ id: 'default' as const, ownerUid: user.uid, schemaVersion: 1 as const }))
};

const planGateway: PlanGateway = {
  create: vi.fn(async (user, draft) => ({ ...draft, id: draft.clientRequestId, ownerUid: user.uid, workspaceId: 'default' as const, status: 'active' as const, schemaVersion: 1 as const })),
  list: vi.fn(async () => [])
};

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
    expect(screen.getByRole('heading', { name: 'Protect time you can actually keep.' })).toBeVisible();
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

  it('moves from workspace confirmation to availability and Empty Today', async () => {
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={planGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue setup' }));
    fireEvent.click(screen.getByRole('button', { name: '15 hours' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save availability' }));
    expect(await screen.findByRole('heading', { name: 'Nothing is scheduled yet.' })).toBeVisible();
    expect(screen.getByText('15 hours/week')).toBeVisible();
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
    fireEvent.change(screen.getByLabelText('Hours available each week'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review Plan' }));
    expect(screen.getByRole('heading', { name: 'Launch a useful product' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));
    expect(await screen.findByText('Your Plan is ready. Longview will use it to shape your next useful step.')).toBeVisible();
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][1].clientRequestId).toBeTruthy();
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

  it('loads and presents owner Plans when the Plans tab opens', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [{
      id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default' as const,
      title: 'Launch Longview', outcome: 'Release a tested PWA to real users.', why: 'Validate the product direction.',
      targetDate: '2026-08-20', weeklyHours: 10, status: 'active' as const, schemaVersion: 1 as const
    }]);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={todayGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plans' }));
    expect(await screen.findByRole('heading', { name: 'Launch Longview' })).toBeVisible();
    expect(screen.getByText('Release a tested PWA to real users.')).toBeVisible();
    expect(screen.getByText('10 hours')).toBeVisible();
    expect(list).toHaveBeenCalledOnce();
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
    const list = vi.fn(async () => [{
      id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default' as const,
      title: 'Launch Longview', outcome: 'Release a tested PWA to real users.', why: 'Validate the product direction.',
      targetDate: '2026-08-20', weeklyHours: 3, status: 'active' as const, schemaVersion: 1 as const
    }]);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} />);
    expect(await screen.findByRole('heading', { name: 'One useful step is enough.' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Define the first proof of progress' })).toBeVisible();
    expect(screen.getByText('45 minutes')).toBeVisible();
    expect(screen.getByText('From Launch Longview')).toBeVisible();
  });

  it('requires confirmation before recording Today completion', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [{
      id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default' as const,
      title: 'Launch Longview', outcome: 'Release a tested PWA to real users.', why: 'Validate the product direction.',
      targetDate: '2026-08-20', weeklyHours: 4, status: 'active' as const, schemaVersion: 1 as const
    }]);
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
    const list = vi.fn(async () => [{
      id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default' as const,
      title: 'Launch Longview', outcome: 'Release a tested PWA to real users.', why: 'Validate the product direction.',
      targetDate: '2026-08-20', weeklyHours: 4, status: 'active' as const, schemaVersion: 1 as const
    }]);
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
    const list = vi.fn(async () => [{
      id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default' as const,
      title: 'Launch Longview', outcome: 'Release a tested PWA to real users.', why: 'Validate the product direction.',
      targetDate: '2026-08-20', weeklyHours: 4, status: 'active' as const, schemaVersion: 1 as const
    }]);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={{ get: vi.fn(async () => saved), complete: vi.fn(todayGateway.complete) }} />);
    expect(await screen.findByRole('heading', { name: 'Today’s step is complete.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mark step complete' })).not.toBeInTheDocument();
  });

  it('retries completion-state loading without changing the step', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [{
      id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default' as const,
      title: 'Launch Longview', outcome: 'Release a tested PWA to real users.', why: 'Validate the product direction.',
      targetDate: '2026-08-20', weeklyHours: 4, status: 'active' as const, schemaVersion: 1 as const
    }]);
    const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={{ get, complete: vi.fn(todayGateway.complete) }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Progress couldn’t be checked');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Mark step complete' })).toBeVisible();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('shows a scoped read-only Clara recommendation without writing', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [{
      id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default' as const,
      title: 'Launch Longview', outcome: 'Release a tested PWA to real users.', why: 'Validate the product direction.',
      targetDate: '2026-08-20', weeklyHours: 4, status: 'active' as const, schemaVersion: 1 as const
    }]);
    const recommend = vi.fn(async context => ({
      schemaVersion: 1, requestId: context.requestId, sourcePlanId: context.plan.id,
      headline: 'Protect the smallest proof', recommendation: 'Finish this step before adding new work.',
      rationale: 'It creates evidence for the nearest active target.', confidence: 'medium',
      requiresClarification: false, sourceFacts: ['Plan: Launch Longview', 'Today step: 60 minutes'], proposedChange: null
    }));
    const complete = vi.fn(todayGateway.complete);
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} planGateway={{ ...planGateway, list }} todayGateway={{ get: vi.fn(async () => null), complete }} claraGateway={{ recommend }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Clara about this step' }));
    expect(await screen.findByRole('heading', { name: 'Protect the smallest proof' })).toBeVisible();
    expect(screen.getByText('Preview adapter · Nothing was changed.')).toBeVisible();
    expect(recommend.mock.calls[0][0].plan).toMatchObject({ id: 'plan-1', title: 'Launch Longview' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('fails closed on invalid Clara output and retries safely', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const list = vi.fn(async () => [{
      id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default' as const,
      title: 'Launch Longview', outcome: 'Release a tested PWA to real users.', why: 'Validate the product direction.',
      targetDate: '2026-08-20', weeklyHours: 4, status: 'active' as const, schemaVersion: 1 as const
    }]);
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
});
