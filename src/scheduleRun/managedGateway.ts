import { auth } from '../firebase/config';
import { parseScheduleRun, ScheduleRunMalformedError, type ScheduleRunGateway } from './types';

type Identity = { getToken(): Promise<string> };

export function createManagedScheduleRunGateway(
  baseUrl: string,
  getIdentity: () => Promise<Identity>,
  fetcher: typeof fetch = fetch
): ScheduleRunGateway {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/clara/schedule-runs`;
  const call = async (url: string, method: 'GET' | 'POST', signal?: AbortSignal, body?: unknown) => {
    const identity = await getIdentity();
    const token = await identity.getToken();
    const response = await fetcher(url, {
      method, signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) throw new Error(`Schedule run failed with status ${response.status}`);
    const run = parseScheduleRun(await response.json());
    if (!run) throw new ScheduleRunMalformedError();
    return run;
  };
  return {
    start: (context, signal) => call(endpoint, 'POST', signal, context),
    get: (runId, signal) => call(`${endpoint}/${encodeURIComponent(runId)}`, 'GET', signal),
    cancel: (runId, signal) => call(`${endpoint}/${encodeURIComponent(runId)}/cancel`, 'POST', signal)
  };
}

export const managedScheduleRunGateway = createManagedScheduleRunGateway(
  import.meta.env.VITE_CLARA_API_URL || '',
  async () => {
    if (!auth.currentUser) throw new Error('Authentication required');
    return { getToken: () => auth.currentUser!.getIdToken() };
  }
);
