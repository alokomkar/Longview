import { auth } from '../firebase/config';
import { parseApprovedDay } from '../approvedDay/types';
import {
  DayBreakConflictError,
  parseDayBreakPreview,
  parseDayBreakResult,
  type DayBreakFailure,
  type DayBreakGateway
} from './types';

async function conflict(response: Response): Promise<DayBreakConflictError> {
  const payload = await response.json().catch(() => null) as { detail?: unknown } | null;
  const reason = payload?.detail;
  return new DayBreakConflictError(
    reason === 'future-approved' || reason === 'no-eligible-day' ? reason : 'source-changed'
  );
}

export function createManagedDayBreakGateway(
  baseUrl: string,
  getToken: () => Promise<string>,
  fetcher: typeof fetch = fetch
): DayBreakGateway {
  const root = `${baseUrl.replace(/\/$/, '')}/v1/clara/approved-days`;
  const headers = async (json = false) => ({
    Authorization: `Bearer ${await getToken()}`,
    ...(json ? { 'Content-Type': 'application/json' } : {})
  });
  return {
    async preview(selectedDate, signal) {
      const response = await fetcher(`${root}/${encodeURIComponent(selectedDate)}/break-preview`, {
        method: 'GET', signal, headers: await headers()
      });
      if (response.status === 409) throw await conflict(response);
      if (!response.ok) throw new Error(`Day break preview failed with status ${response.status}`);
      const preview = parseDayBreakPreview(await response.json());
      if (!preview || preview.selectedDate !== selectedDate) throw new Error('Day break preview failed validation.');
      return preview;
    },
    async confirm(selectedDate, request, signal) {
      const response = await fetcher(`${root}/${encodeURIComponent(selectedDate)}/break`, {
        method: 'POST', signal, headers: await headers(true), body: JSON.stringify(request)
      });
      if (response.status === 409) throw await conflict(response);
      if (!response.ok) throw new Error(`Day break confirmation failed with status ${response.status}`);
      const result = parseDayBreakResult(await response.json(), parseApprovedDay);
      if (!result || result.idempotencyKey !== request.idempotencyKey || result.breakDay.selectedDate !== selectedDate) {
        throw new Error('Day break confirmation failed validation.');
      }
      return result;
    }
  };
}

export const managedDayBreakGateway = createManagedDayBreakGateway(
  import.meta.env.VITE_CLARA_API_URL || '',
  async () => {
    if (!auth.currentUser) throw new Error('Authentication required');
    return auth.currentUser.getIdToken();
  }
);
