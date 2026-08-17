import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScheduleRun, ScheduleRunContext, ScheduleRunGateway } from './types';

export type ScheduleRunSnapshot =
  | { status: 'idle'; run: null; failure: null }
  | { status: 'starting'; run: null; failure: null }
  | { status: 'active'; run: ScheduleRun; failure: null }
  | { status: 'succeeded' | 'cancelled' | 'failed' | 'timed-out'; run: ScheduleRun; failure: null }
  | { status: 'error'; run: ScheduleRun | null; failure: 'offline' | 'unavailable' | 'malformed' };

const terminal = new Set(['succeeded', 'cancelled', 'failed', 'timed-out']);

export function useScheduleRun(gateway: ScheduleRunGateway, pollMs = 450) {
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
        const run = await gateway.get(runId, controller.current.signal);
        accept(run);
        if (!terminal.has(run.status)) timer.current = setTimeout(tick, pollMs);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (mounted.current) setSnapshot(current => ({ status: 'error', run: current.run, failure: navigator.onLine ? 'unavailable' : 'offline' }));
      }
    };
    timer.current = setTimeout(tick, pollMs);
  }, [accept, gateway, pollMs]);

  const start = useCallback(async (context: ScheduleRunContext) => {
    stop();
    setSnapshot({ status: 'starting', run: null, failure: null });
    controller.current = new AbortController();
    try {
      const run = await gateway.start(context, controller.current.signal);
      accept(run);
      if (!terminal.has(run.status)) poll(run.runId);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (mounted.current) setSnapshot({ status: 'error', run: null, failure: navigator.onLine ? 'unavailable' : 'offline' });
    }
  }, [accept, gateway, poll, stop]);

  const cancel = useCallback(async () => {
    const run = snapshot.run;
    if (!run || terminal.has(run.status)) return;
    stop();
    try {
      accept(await gateway.cancel(run.runId));
    } catch {
      if (mounted.current) setSnapshot({ status: 'error', run, failure: navigator.onLine ? 'unavailable' : 'offline' });
    }
  }, [accept, gateway, snapshot.run, stop]);

  const reset = useCallback(() => {
    stop();
    setSnapshot({ status: 'idle', run: null, failure: null });
  }, [stop]);

  return { snapshot, start, cancel, reset };
}
