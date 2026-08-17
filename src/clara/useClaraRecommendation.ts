import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ClaraGatewayTimeoutError,
  parseClaraRecommendation,
  type ClaraContext,
  type ClaraGateway,
  type ClaraRecommendation
} from './types';

export type ClaraFailure = 'offline' | 'timeout' | 'malformed' | 'unavailable';
type ClaraSnapshot =
  | { status: 'idle'; recommendation: null; failure: null }
  | { status: 'loading'; recommendation: null; failure: null }
  | { status: 'ready'; recommendation: ClaraRecommendation; failure: null }
  | { status: 'error'; recommendation: null; failure: ClaraFailure };

const newRequestId = () => globalThis.crypto?.randomUUID?.() ?? `clara-${Date.now()}`;

export function useClaraRecommendation(gateway: ClaraGateway, timeoutMs = 18000) {
  const [snapshot, setSnapshot] = useState<ClaraSnapshot>({ status: 'idle', recommendation: null, failure: null });
  const active = useRef<AbortController | null>(null);
  const previous = useRef<ClaraContext | null>(null);

  const ask = useCallback(async (context: ClaraContext) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    previous.current = context;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    setSnapshot({ status: 'loading', recommendation: null, failure: null });
    try {
      const value = await gateway.recommend(context, controller.signal);
      if (active.current !== controller || controller.signal.aborted) return;
      const recommendation = parseClaraRecommendation(value, context);
      setSnapshot(recommendation
        ? { status: 'ready', recommendation, failure: null }
        : { status: 'error', recommendation: null, failure: 'malformed' });
    } catch (error) {
      if (active.current !== controller) return;
      if (controller.signal.aborted && !timedOut) return;
      setSnapshot({
        status: 'error', recommendation: null,
        failure: timedOut || error instanceof ClaraGatewayTimeoutError
          ? 'timeout'
          : navigator.onLine === false ? 'offline' : 'unavailable'
      });
    } finally {
      window.clearTimeout(timeout);
      if (active.current === controller) active.current = null;
    }
  }, [gateway, timeoutMs]);

  const cancel = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setSnapshot({ status: 'idle', recommendation: null, failure: null });
  }, []);

  const retry = useCallback(() => {
    if (!previous.current) return;
    void ask({ ...previous.current, requestId: newRequestId() });
  }, [ask]);

  useEffect(() => () => { active.current?.abort(); }, []);
  return { snapshot, ask, cancel, retry };
}
