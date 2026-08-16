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
    linkGoogle: vi.fn(async () => { if (failure) throw failure; })
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
      linkGoogle: vi.fn(async () => listener({ uid: 'stable-uid', isAnonymous: false, displayName: 'Owner' }))
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
});
