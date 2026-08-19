import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../auth/types';
import { requestTimedOut, withRequestDeadline } from '../network/requestDeadline';
import { ResearchGatewayTimeoutError, parseResearchResponse, type ResearchGateway, type ResearchRequest, type ResearchResponse } from './types';

export type ResearchFailure = 'offline' | 'timeout' | 'malformed' | 'unavailable';
type Snapshot =
  | { status: 'idle' | 'loading'; response: null; failure: null }
  | { status: 'ready'; response: ResearchResponse; failure: null }
  | { status: 'error'; response: null; failure: ResearchFailure };

export function useResearchRequest(user: AuthUser, gateway: ResearchGateway, timeoutMs = 15_000) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: 'idle', response: null, failure: null });
  const controller = useRef<AbortController | null>(null);
  const lastRequest = useRef<ResearchRequest | null>(null);

  const request = useCallback(async (value: ResearchRequest) => {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    lastRequest.current = value;
    setSnapshot({ status: 'loading', response: null, failure: null });
    try {
      const raw = await withRequestDeadline(active, timeoutMs, signal => gateway.request(user, value, signal));
      if (active.signal.aborted) return;
      const response = parseResearchResponse(raw, value);
      setSnapshot(response
        ? { status: 'ready', response, failure: null }
        : { status: 'error', response: null, failure: 'malformed' });
    } catch (error) {
      if (active.signal.aborted && !requestTimedOut(error)) return;
      setSnapshot({ status: 'error', response: null, failure: requestTimedOut(error) || error instanceof ResearchGatewayTimeoutError
        ? 'timeout' : navigator.onLine === false ? 'offline' : 'unavailable' });
    } finally {
      if (controller.current === active) controller.current = null;
    }
  }, [gateway, timeoutMs, user]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setSnapshot({ status: 'idle', response: null, failure: null });
  }, []);
  const retry = useCallback(() => { if (lastRequest.current) void request(lastRequest.current); }, [request]);
  const clear = useCallback(() => setSnapshot({ status: 'idle', response: null, failure: null }), []);
  useEffect(() => () => controller.current?.abort(), []);
  return { snapshot, request, retry, cancel, clear };
}
