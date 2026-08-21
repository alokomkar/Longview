import { useCallback, useEffect, useState } from 'react';
import { classifyAuthError } from './errors';
import type { AuthFailure, AuthGateway, AuthSnapshot } from './types';

export function useAuth(gateway: AuthGateway) {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      let redirectFailure: AuthFailure | undefined;
      try {
        await gateway.completeRedirectSignIn?.();
      } catch (error) {
        redirectFailure = classifyAuthError(error);
      }

      if (!active) return;
      unsubscribe = gateway.observe(user => {
        if (!active) return;
        const failure = redirectFailure;
        redirectFailure = undefined;
        setSnapshot(user
          ? { status: 'authenticated', user, linking: false, ...(failure ? { failure } : {}) }
          : { status: 'signed-out', ...(failure ? { failure } : {}) });
      });
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [gateway]);

  const run = useCallback(async (operation: () => Promise<void>, linking = false) => {
    setSnapshot(current => current.status === 'authenticated'
      ? { ...current, linking, failure: undefined }
      : { status: 'loading' });
    try {
      await operation();
    } catch (error) {
      const failure = classifyAuthError(error);
      setSnapshot(current => current.status === 'authenticated'
        ? { ...current, linking: false, failure }
        : { status: 'signed-out', failure });
    }
  }, []);

  return {
    snapshot,
    continueAnonymously: () => run(() => gateway.signInAnonymously()),
    continueWithGoogle: () => run(() => gateway.signInGoogle()),
    linkGoogle: () => run(() => gateway.linkGoogle(), true),
    useExistingGoogle: () => run(() => gateway.signInGoogle(), true),
    signOut: () => run(() => gateway.signOut())
  };
}
