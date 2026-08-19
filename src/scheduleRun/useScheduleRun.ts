import { useCallback, useEffect, useRef, useState } from 'react';
import { ScheduleRunMalformedError, type ScheduleRun, type ScheduleRunContext, type ScheduleRunGateway } from './types';
import { requestTimedOut, withRequestDeadline } from '../network/requestDeadline';

export type ScheduleRunSnapshot =
  | { status: 'idle'; run: null; failure: null }
  | { status: 'starting'; run: null; failure: null }
  | { status: 'active'; run: ScheduleRun; failure: null }
  | { status: 'succeeded' | 'cancelled' | 'failed' | 'timed-out'; run: ScheduleRun; failure: null }
  | { status: 'error'; run: ScheduleRun | null; failure: 'offline' | 'unavailable' | 'malformed' | 'timeout' };

const terminal = new Set(['succeeded', 'cancelled', 'failed', 'timed-out']);
const failureFor = (error: unknown): 'offline' | 'unavailable' | 'malformed' | 'timeout' =>
  requestTimedOut(error) ? 'timeout'
    : error instanceof ScheduleRunMalformedError ? 'malformed'
      : navigator.onLine ? 'unavailable' : 'offline';

export function useScheduleRun(gateway: ScheduleRunGateway, pollMs = 450, requestTimeoutMs = 12000) {
  const [snapshot, setSnapshot] = useState<ScheduleRunSnapshot>({ status: 'idle', run: null, failure: null });
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop(); };
  }, [stop]);

  const accept = useCallback((run: ScheduleRun) => {
    if (!mounted.current) return;
    setSnapshot({ status: terminal.has(run.status) ? run.status as 'succeeded' | 'cancelled' | 'failed' | 'timed-out' : 'active', run, failure: null });
  }, []);

  const poll = useCallback((runId: string) => {
    const tick = async () => {
      controller.current = new AbortController();
      try {
        const active = controller.current;
        const run = await withRequestDeadline(active, requestTimeoutMs, signal => gateway.get(runId, signal));
        accept(run);
        if (!terminal.has(run.status)) timer.current = setTimeout(tick, pollMs);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (mounted.current) setSnapshot(current => ({ status: 'error', run: current.run, failure: failureFor(error) }));
      }
    };
    timer.current = setTimeout(tick, pollMs);
  }, [accept, gateway, pollMs, requestTimeoutMs]);

  const start = useCallback(async (context: ScheduleRunContext) => {
    stop();
    setSnapshot({ status: 'starting', run: null, failure: null });
    controller.current = new AbortController();
    try {
      const active = controller.current;
      const run = await withRequestDeadline(active, requestTimeoutMs, signal => gateway.start(context, signal));
      accept(run);
      if (!terminal.has(run.status)) poll(run.runId);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (mounted.current) setSnapshot({ status: 'error', run: null, failure: failureFor(error) });
    }
  }, [accept, gateway, poll, requestTimeoutMs, stop]);

  const cancel = useCallback(async () => {
    const run = snapshot.run;
    if (!run || terminal.has(run.status)) return;
    stop();
    controller.current = new AbortController();
    try {
      const active = controller.current;
      accept(await withRequestDeadline(active, requestTimeoutMs, signal => gateway.cancel(run.runId, signal)));
    } catch (error) {
      if (mounted.current) setSnapshot({ status: 'error', run, failure: failureFor(error) });
    }
  }, [accept, gateway, requestTimeoutMs, snapshot.run, stop]);

  const reset = useCallback(() => {
    stop();
    setSnapshot({ status: 'idle', run: null, failure: null });
  }, [stop]);

  return { snapshot, start, cancel, reset };
}
