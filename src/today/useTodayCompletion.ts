import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { TodayStep } from './deriveTodayStep';
import type { TodayCompletion, TodayGateway } from './types';

type CompletionSnapshot =
  | { status: 'idle' | 'loading'; completion: null; stepId: string | null }
  | { status: 'ready'; completion: TodayCompletion | null; stepId: string }
  | { status: 'error'; completion: null; stepId: string };

export function useTodayCompletion(user: AuthUser, step: TodayStep | null, gateway: TodayGateway, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<CompletionSnapshot>({ status: 'idle', completion: null, stepId: null });
  const [attempt, setAttempt] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const stepId = step?.completionId;

  useEffect(() => {
    if (!enabled || !step) return;
    let active = true;
    setSnapshot({ status: 'loading', completion: null, stepId: step.completionId });
    setSaveFailed(false);
    gateway.get(user, step).then(
      completion => { if (active) setSnapshot({ status: 'ready', completion, stepId: step.completionId }); },
      () => { if (active) setSnapshot({ status: 'error', completion: null, stepId: step.completionId }); }
    );
    return () => { active = false; };
  }, [attempt, enabled, gateway, stepId, user.uid]);

  const complete = useCallback(async () => {
    if (!step || completing) return false;
    setCompleting(true);
    setSaveFailed(false);
    try {
      const saved = await gateway.complete(user, step);
      setSnapshot({ status: 'ready', completion: saved, stepId: step.completionId });
      return true;
    } catch {
      setSaveFailed(true);
      return false;
    } finally {
      setCompleting(false);
    }
  }, [completing, gateway, step, user]);

  const currentSnapshot: CompletionSnapshot = snapshot.stepId === stepId
    ? snapshot
    : { status: 'idle', completion: null, stepId: stepId ?? null };

  return {
    snapshot: currentSnapshot,
    completing,
    saveFailed,
    complete,
    retry: useCallback(() => setAttempt(value => value + 1), [])
  };
}
