import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { TodayStep } from './deriveTodayStep';
import type { TodayOutbox, TodayPendingCompletion } from './outbox';
import { TodayOutboxValidationError } from './outbox';
import { parseTodayCompletion, TodayCompletionValidationError, type TodayCompletion, type TodayCompletionResult, type TodayGateway } from './types';

type CompletionSnapshot =
  | { status: 'idle' | 'loading'; completion: null; stepId: string | null }
  | { status: 'ready'; completion: TodayCompletion | null; stepId: string; duplicate: boolean | null }
  | { status: 'error'; completion: null; stepId: string };

export type TodaySyncStatus = 'idle' | 'pending' | 'syncing' | 'retry' | 'blocked';

const onlineNow = () => typeof navigator === 'undefined' || navigator.onLine !== false;

const errorCode = (error: unknown) => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return String((error as { code?: unknown }).code ?? '').replace(/^firestore\//, '');
};

const blockedFailure = (error: unknown) => error instanceof TodayCompletionValidationError ||
  error instanceof TodayOutboxValidationError || ['permission-denied', 'unauthenticated'].includes(errorCode(error) ?? '');

function validatedResult(result: TodayCompletionResult, user: AuthUser, step: TodayStep): TodayCompletionResult {
  const completion = parseTodayCompletion(result?.completion, step.completionId, user.uid, step);
  if (!completion || typeof result?.duplicate !== 'boolean') throw new TodayCompletionValidationError();
  return { completion, duplicate: result.duplicate };
}

export function useTodayCompletion(
  user: AuthUser,
  step: TodayStep | null,
  gateway: TodayGateway,
  outbox: TodayOutbox,
  enabled: boolean
) {
  const [snapshot, setSnapshot] = useState<CompletionSnapshot>({ status: 'idle', completion: null, stepId: null });
  const [pending, setPending] = useState<TodayPendingCompletion | null>(null);
  const [syncStatus, setSyncStatus] = useState<TodaySyncStatus>('idle');
  const [attempt, setAttempt] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [offline, setOffline] = useState(!onlineNow());
  const pendingRef = useRef<TodayPendingCompletion | null>(null);
  const syncingRef = useRef(false);
  const stepId = step?.completionId;
  const currentStepIdRef = useRef(stepId);
  currentStepIdRef.current = stepId;

  const updatePending = useCallback((value: TodayPendingCompletion | null) => {
    pendingRef.current = value;
    setPending(value);
  }, []);

  const synchronize = useCallback(async (loadedPending?: TodayPendingCompletion) => {
    const queued = loadedPending ?? pendingRef.current;
    if (!enabled || !step || !queued || !onlineNow() || syncingRef.current) return false;
    const expectedStepId = step.completionId;
    syncingRef.current = true;
    setOffline(false);
    setSyncStatus('syncing');
    try {
      const result = validatedResult(await gateway.complete(user, step), user, step);
      if (currentStepIdRef.current !== expectedStepId) return false;
      setSnapshot({ status: 'ready', completion: result.completion, stepId: expectedStepId, duplicate: result.duplicate });
      setSyncStatus('idle');
      return true;
    } catch (error) {
      if (currentStepIdRef.current !== expectedStepId) return false;
      if (blockedFailure(error)) {
        setSyncStatus('blocked');
        return false;
      }
      const failure = onlineNow() ? 'unavailable' : 'offline';
      setOffline(failure === 'offline');
      try {
        updatePending(await outbox.recordFailure(user, step, failure));
        setSyncStatus('retry');
      } catch {
        setSyncStatus('blocked');
      }
      return false;
    } finally {
      syncingRef.current = false;
    }
  }, [enabled, gateway, outbox, step, updatePending, user]);

  useEffect(() => {
    if (!enabled || !step) {
      updatePending(null);
      setSyncStatus('idle');
      setSnapshot({ status: 'idle', completion: null, stepId: step?.completionId ?? null });
      return;
    }
    const expectedStepId = step.completionId;
    let active = true;
    setSnapshot({ status: 'loading', completion: null, stepId: expectedStepId });
    updatePending(null);
    setSyncStatus('idle');
    setSaveFailed(false);

    const load = async () => {
      let queued: TodayPendingCompletion | null;
      try {
        queued = await outbox.get(user, step);
      } catch {
        if (!active) return;
        setSnapshot({ status: 'ready', completion: null, stepId: expectedStepId, duplicate: null });
        setSyncStatus('blocked');
        return;
      }
      if (!active) return;
      updatePending(queued);
      if (!onlineNow()) {
        setOffline(true);
        setSnapshot({ status: 'ready', completion: null, stepId: expectedStepId, duplicate: null });
        setSyncStatus(queued ? 'pending' : 'idle');
        return;
      }
      setOffline(false);
      try {
        const completion = await gateway.get(user, step);
        if (!active) return;
        setSnapshot({ status: 'ready', completion, stepId: expectedStepId, duplicate: null });
        if (completion) setSyncStatus('idle');
        else if (queued) void synchronize(queued);
      } catch {
        if (!active) return;
        setSnapshot(queued
          ? { status: 'ready', completion: null, stepId: expectedStepId, duplicate: null }
          : { status: 'error', completion: null, stepId: expectedStepId });
        setSyncStatus(queued ? 'retry' : 'idle');
      }
    };
    void load();
    return () => { active = false; };
  }, [attempt, enabled, gateway, outbox, stepId, synchronize, updatePending, user.uid]);

  useEffect(() => {
    if (!enabled || !step) return;
    const handleOffline = () => {
      setOffline(true);
      if (pendingRef.current && !syncingRef.current) setSyncStatus('pending');
    };
    const handleOnline = () => {
      setOffline(false);
      void synchronize();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && onlineNow()) void synchronize();
    };
    globalThis.addEventListener('offline', handleOffline);
    globalThis.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      globalThis.removeEventListener('offline', handleOffline);
      globalThis.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, stepId, synchronize]);

  useEffect(() => {
    if (!enabled || !step || !pending || snapshot.status !== 'ready' || !snapshot.completion) return;
    const expectedStepId = step.completionId;
    let active = true;
    outbox.remove(user, step).then(() => {
      if (active && currentStepIdRef.current === expectedStepId) updatePending(null);
    }, () => {
      // The verified cloud proof remains visible. A later foreground sync safely retries cleanup.
    });
    return () => { active = false; };
  }, [enabled, outbox, pending, snapshot, step, updatePending, user]);

  const complete = useCallback(async () => {
    if (!enabled || !step || completing || syncStatus === 'blocked') return false;
    const expectedStepId = step.completionId;
    setCompleting(true);
    setSaveFailed(false);
    if (!onlineNow()) {
      try {
        const queued = await outbox.put(user, step);
        if (currentStepIdRef.current !== expectedStepId) return false;
        updatePending(queued);
        setOffline(true);
        setSyncStatus('pending');
        setSnapshot({ status: 'ready', completion: null, stepId: expectedStepId, duplicate: null });
        return true;
      } catch {
        setSaveFailed(true);
        return false;
      } finally {
        setCompleting(false);
      }
    }
    try {
      const result = validatedResult(await gateway.complete(user, step), user, step);
      if (currentStepIdRef.current !== expectedStepId) return false;
      setSnapshot({ status: 'ready', completion: result.completion, stepId: expectedStepId, duplicate: result.duplicate });
      return true;
    } catch (error) {
      if (blockedFailure(error)) {
        setSaveFailed(true);
        setSyncStatus('blocked');
        return false;
      }
      try {
        let queued = await outbox.put(user, step);
        queued = await outbox.recordFailure(user, step, onlineNow() ? 'unavailable' : 'offline');
        if (currentStepIdRef.current !== expectedStepId) return false;
        updatePending(queued);
        setOffline(!onlineNow());
        setSyncStatus('retry');
        setSnapshot({ status: 'ready', completion: null, stepId: expectedStepId, duplicate: null });
        return true;
      } catch {
        setSaveFailed(true);
        return false;
      }
    } finally {
      setCompleting(false);
    }
  }, [completing, enabled, gateway, outbox, step, syncStatus, updatePending, user]);

  const currentSnapshot: CompletionSnapshot = snapshot.stepId === stepId
    ? snapshot
    : { status: 'idle', completion: null, stepId: stepId ?? null };
  const currentPending = pending && pending.completion.id === stepId && pending.ownerUid === user.uid ? pending : null;

  return {
    snapshot: currentSnapshot,
    pending: currentPending,
    syncStatus: currentPending ? syncStatus : syncStatus === 'blocked' ? 'blocked' : 'idle',
    offline,
    completing,
    saveFailed,
    complete,
    retrySync: synchronize,
    retry: useCallback(() => setAttempt(value => value + 1), [])
  };
}
