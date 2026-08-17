import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AuthGateway, AuthUser } from './auth/types';
import type { WorkspaceGateway } from './workspace/types';

const workspaceGateway: WorkspaceGateway = {
  ensure: vi.fn(async (user: AuthUser) => ({ id: 'default' as const, ownerUid: user.uid, schemaVersion: 1 as const }))
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
    render(<App gateway={mock} workspaceGateway={workspaceGateway} />);
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
    render(<App gateway={gateway(null, { code })} workspaceGateway={workspaceGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Continue anonymously' })).toBeEnabled();
  });

  it('keeps the anonymous workspace when account linking conflicts', async () => {
    const user = { uid: 'anon-1', isAnonymous: true, displayName: null };
    render(<App gateway={gateway(user, { code: 'auth/credential-already-in-use' })} workspaceGateway={workspaceGateway} />);
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
    render(<App gateway={gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' })} workspaceGateway={workspaceGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue setup' }));
    fireEvent.click(screen.getByRole('button', { name: '15 hours' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save availability' }));
    expect(await screen.findByRole('heading', { name: 'Nothing is scheduled yet.' })).toBeVisible();
    expect(screen.getByText('15 hours/week')).toBeVisible();
  });

  it('signs out from Settings without clearing saved onboarding', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const mock = gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' });
    render(<App gateway={mock} workspaceGateway={workspaceGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeVisible();
    expect(localStorage.getItem('longview:onboarding')).toBe('complete');
  });

  it('warns anonymous users and offers account linking before sign-out', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const mock = gateway({ uid: 'anon-1', isAnonymous: true, displayName: null });
    render(<App gateway={mock} workspaceGateway={workspaceGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('alert')).toHaveTextContent('inaccessible from this browser');
    expect(screen.getByRole('button', { name: 'Link Google account' })).toBeVisible();
    expect(mock.signOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and lose access' }));
    expect(await screen.findByRole('button', { name: 'Continue anonymously' })).toBeVisible();
  });

  it('requires confirmation before clearing browser-local data', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const mock = gateway({ uid: 'owner', isAnonymous: false, displayName: 'Owner' });
    render(<App gateway={mock} workspaceGateway={workspaceGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear local data' }));
    expect(screen.getByRole('alert')).toHaveTextContent('not deleted');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm clear local data' }));
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeVisible();
    expect(localStorage.getItem('longview:onboarding')).toBeNull();
  });

  it('keeps Google linking available in Settings after anonymous onboarding', async () => {
    localStorage.setItem('longview:onboarding', 'complete');
    const mock = gateway({ uid: 'anon-1', isAnonymous: true, displayName: null });
    render(<App gateway={mock} workspaceGateway={workspaceGateway} />);
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
    render(<App gateway={mock} workspaceGateway={workspaceGateway} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link Google account' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use existing Google workspace' }));
    await waitFor(() => expect(mock.signInGoogle).toHaveBeenCalledOnce());
    expect(screen.queryByRole('button', { name: 'Link Google account' })).not.toBeInTheDocument();
  });
});
