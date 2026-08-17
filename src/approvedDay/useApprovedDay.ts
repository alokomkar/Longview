import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScheduleRun } from '../scheduleRun/types';
import {
  ApprovedDayConflictError,
  canApproveRun,
  type ApprovedDay,
  type ApprovedDayGateway,
  type DayApprovalResult
} from './types';

export type ApprovedDaySnapshot =
  | { status: 'idle' | 'loading'; day: ApprovedDay | null; failure: null }
  | { status: 'ready'; day: ApprovedDay | null; failure: null }
  | { status: 'error'; day: ApprovedDay | null; failure: 'unavailable' };

export type DayApprovalSnapshot =
  | { status: 'idle' | 'applying'; result: null; failure: null }
  | { status: 'success'; result: DayApprovalResult; failure: null }
  | { status: 'error'; result: null; failure: 'conflict' | 'unavailable' };

const createKey = () => globalThis.crypto?.randomUUID?.() ?? `day-approval-${Date.now()}`;

export function useApprovedDay(
  gateway: ApprovedDayGateway,
  selectedDate: string,
  enabled: boolean
) {
  const [snapshot, setSnapshot] = useState<ApprovedDaySnapshot>({ status: 'idle', day: null, failure: null });
  const [approval, setApproval] = useState<DayApprovalSnapshot>({ status: 'idle', result: null, failure: null });
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<{ runId: string; key: string; revision: number; replace: boolean } | null>(null);
  const lastRun = useRef<ScheduleRun | null>(null);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setSnapshot(current => ({ status: 'loading', day: current.day, failure: null }));
    try {
      const day = await gateway.get(selectedDate, controller.current.signal);
      if (version === loadVersion.current) setSnapshot({ status: 'ready', day, failure: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (version === loadVersion.current) setSnapshot(current => ({ status: 'error', day: current.day, failure: 'unavailable' }));
    }
  }, [gateway, selectedDate]);

  useEffect(() => {
    if (!enabled) {
      controller.current?.abort();
      return;
    }
    void load();
    return () => controller.current?.abort();
  }, [enabled, load]);

  const approve = useCallback(async (run: ScheduleRun) => {
    if (!canApproveRun(run) || run.selectedDate !== selectedDate || approval.status === 'applying') return;
    lastRun.current = run;
    const revision = snapshot.day?.revision ?? 0;
    const replace = Boolean(snapshot.day);
    const existing = pending.current;
    const key = existing && existing.runId === run.runId && existing.revision === revision && existing.replace === replace
      ? existing.key
      : createKey();
    pending.current = { runId: run.runId, key, revision, replace };
    controller.current?.abort();
    controller.current = new AbortController();
    setApproval({ status: 'applying', result: null, failure: null });
    try {
      const result = await gateway.approve(run.runId, {
        schemaVersion: 1,
        idempotencyKey: key,
        expectedDayRevision: revision,
        replaceCurrent: replace
      }, controller.current.signal);
      if (result.approvedDay.selectedDate !== selectedDate) throw new Error('Approved date did not match.');
      setSnapshot({ status: 'ready', day: result.approvedDay, failure: null });
      setApproval({ status: 'success', result, failure: null });
      pending.current = null;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const conflict = error instanceof ApprovedDayConflictError;
      setApproval({ status: 'error', result: null, failure: conflict ? 'conflict' : 'unavailable' });
      if (conflict) pending.current = null;
    }
  }, [approval.status, gateway, selectedDate, snapshot.day]);

  const retryApproval = useCallback(() => {
    if (lastRun.current) void approve(lastRun.current);
  }, [approve]);

  const resetApproval = useCallback(() => {
    controller.current?.abort();
    pending.current = null;
    lastRun.current = null;
    setApproval({ status: 'idle', result: null, failure: null });
  }, []);

  return { snapshot, approval, approve, retryApproval, reload: load, resetApproval };
}
