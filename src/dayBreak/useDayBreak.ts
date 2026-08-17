import { useCallback, useRef, useState } from 'react';
import type { ApprovedDay } from '../approvedDay/types';
import {
  DayBreakConflictError,
  type DayBreakFailure,
  type DayBreakGateway,
  type DayBreakPreview,
  type DayBreakResult
} from './types';

export type DayBreakSnapshot =
  | { status: 'idle' | 'loading'; preview: null; result: null; failure: null }
  | { status: 'review'; preview: DayBreakPreview; result: null; failure: null }
  | { status: 'applying'; preview: DayBreakPreview; result: null; failure: null }
  | { status: 'success'; preview: DayBreakPreview; result: DayBreakResult; failure: null }
  | { status: 'error'; preview: DayBreakPreview | null; result: null; failure: DayBreakFailure };

const createKey = () => globalThis.crypto?.randomUUID?.() ?? `day-break-${Date.now()}`;

export function useDayBreak(gateway: DayBreakGateway) {
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
      const value = await gateway.preview(day.selectedDate, controller.current.signal);
      if (value.expectedDayRevision !== day.revision || value.sourceApprovalEventId !== day.approvalEventId) {
        throw new DayBreakConflictError('source-changed');
      }
      setSnapshot({ status: 'review', preview: value, result: null, failure: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setSnapshot({
        status: 'error', preview: null, result: null,
        failure: error instanceof DayBreakConflictError ? error.reason : 'unavailable'
      });
    }
  }, [gateway]);

  const confirm = useCallback(async () => {
    const current = snapshot.preview;
    if (!current || snapshot.status === 'applying') return;
    controller.current?.abort();
    controller.current = new AbortController();
    if (!key.current) key.current = createKey();
    setSnapshot({ status: 'applying', preview: current, result: null, failure: null });
    try {
      const result = await gateway.confirm(current.selectedDate, {
        schemaVersion: 1,
        idempotencyKey: key.current,
        expectedDayRevision: current.expectedDayRevision,
        carryovers: current.carryovers
      }, controller.current.signal);
      setSnapshot({ status: 'success', preview: current, result, failure: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const failure = error instanceof DayBreakConflictError ? error.reason : 'unavailable';
      if (failure !== 'unavailable') key.current = '';
      setSnapshot({ status: 'error', preview: current, result: null, failure });
    }
  }, [gateway, snapshot]);

  const reset = useCallback(() => {
    controller.current?.abort();
    key.current = '';
    setSnapshot({ status: 'idle', preview: null, result: null, failure: null });
  }, []);

  return { snapshot, preview, confirm, retry: confirm, reset };
}
