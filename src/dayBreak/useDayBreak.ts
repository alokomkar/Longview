import { useCallback, useRef, useState } from 'react';
import type { ApprovedDay } from '../approvedDay/types';
import {
  DayBreakConflictError,
  type DayBreakFailure,
  type DayBreakGateway,
  type DayBreakPreview,
  type DayBreakResult
} from './types';
import { requestTimedOut, withRequestDeadline } from '../network/requestDeadline';

export type DayBreakSnapshot =
  | { status: 'idle' | 'loading'; preview: null; result: null; failure: null }
  | { status: 'review'; preview: DayBreakPreview; result: null; failure: null }
  | { status: 'applying'; preview: DayBreakPreview; result: null; failure: null }
  | { status: 'success'; preview: DayBreakPreview; result: DayBreakResult; failure: null }
  | { status: 'error'; preview: DayBreakPreview | null; result: null; failure: DayBreakFailure | 'timeout' };

const createKey = () => globalThis.crypto?.randomUUID?.() ?? `day-break-${Date.now()}`;

export function useDayBreak(gateway: DayBreakGateway, requestTimeoutMs = 12000) {
  const [snapshot, setSnapshot] = useState<DayBreakSnapshot>({ status: 'idle', preview: null, result: null, failure: null });
  const controller = useRef<AbortController | null>(null);
  const key = useRef('');

  const preview = useCallback(async (day: ApprovedDay) => {
    if (day.status !== 'approved') return;
    controller.current?.abort();
    controller.current = new AbortController();
    key.current = '';
    setSnapshot({ status: 'loading', preview: null, result: null, failure: null });
    try {
      const active = controller.current;
      const value = await withRequestDeadline(active, requestTimeoutMs, signal => gateway.preview(day.selectedDate, signal));
      if (value.expectedDayRevision !== day.revision || value.sourceApprovalEventId !== day.approvalEventId) {
        throw new DayBreakConflictError('source-changed');
      }
      setSnapshot({ status: 'review', preview: value, result: null, failure: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setSnapshot({
        status: 'error', preview: null, result: null,
        failure: error instanceof DayBreakConflictError ? error.reason : requestTimedOut(error) ? 'timeout' : 'unavailable'
      });
    }
  }, [gateway, requestTimeoutMs]);

  const confirm = useCallback(async () => {
    const current = snapshot.preview;
    if (!current || snapshot.status === 'applying') return;
    controller.current?.abort();
    controller.current = new AbortController();
    if (!key.current) key.current = createKey();
    setSnapshot({ status: 'applying', preview: current, result: null, failure: null });
    try {
      const active = controller.current;
      const result = await withRequestDeadline(active, requestTimeoutMs, signal => gateway.confirm(current.selectedDate, {
        schemaVersion: 1,
        idempotencyKey: key.current,
        expectedDayRevision: current.expectedDayRevision,
        carryovers: current.carryovers
      }, signal));
      setSnapshot({ status: 'success', preview: current, result, failure: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const failure = error instanceof DayBreakConflictError ? error.reason : requestTimedOut(error) ? 'timeout' : 'unavailable';
      if (failure !== 'unavailable' && failure !== 'timeout') key.current = '';
      setSnapshot({ status: 'error', preview: current, result: null, failure });
    }
  }, [gateway, requestTimeoutMs, snapshot]);

  const reset = useCallback(() => {
    controller.current?.abort();
    key.current = '';
    setSnapshot({ status: 'idle', preview: null, result: null, failure: null });
  }, []);

  return { snapshot, preview, confirm, retry: confirm, reset };
}
