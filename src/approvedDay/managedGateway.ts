import { auth } from '../firebase/config';
import {
  ApprovedDayConflictError,
  parseApprovedDay,
  parseDayApprovalResult,
  type ApprovedDayGateway
} from './types';

export function createManagedApprovedDayGateway(
  baseUrl: string,
  getToken: () => Promise<string>,
  fetcher: typeof fetch = fetch
): ApprovedDayGateway {
  const root = `${baseUrl.replace(/\/$/, '')}/v1/clara`;
  const headers = async (json = false) => ({
    Authorization: `Bearer ${await getToken()}`,
    ...(json ? { 'Content-Type': 'application/json' } : {})
  });
  return {
    async get(selectedDate, signal) {
      const response = await fetcher(`${root}/approved-days/${encodeURIComponent(selectedDate)}`, {
        method: 'GET', signal, headers: await headers()
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Approved day read failed with status ${response.status}`);
      const day = parseApprovedDay(await response.json());
      if (!day || day.selectedDate !== selectedDate) throw new Error('Approved day response failed validation.');
      return day;
    },
    async approve(runId, request, signal) {
      const response = await fetcher(`${root}/schedule-runs/${encodeURIComponent(runId)}/approve`, {
        method: 'POST', signal, headers: await headers(true), body: JSON.stringify(request)
      });
      if (response.status === 409) throw new ApprovedDayConflictError('Approved day changed.');
      if (!response.ok) throw new Error(`Approved day approval failed with status ${response.status}`);
      const result = parseDayApprovalResult(await response.json());
      if (!result || result.idempotencyKey !== request.idempotencyKey || result.approvedDay.sourceRunId !== runId) {
        throw new Error('Approved day approval response failed validation.');
      }
      return result;
    }
  };
}

export const managedApprovedDayGateway = createManagedApprovedDayGateway(
  import.meta.env.VITE_CLARA_API_URL || '',
  async () => {
    if (!auth.currentUser) throw new Error('Authentication required');
    return auth.currentUser.getIdToken();
  }
);
