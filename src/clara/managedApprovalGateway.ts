import { auth } from '../firebase/config';
import {
  ClaraApprovalConflictError,
  parseApprovalResult,
  type ClaraApprovalGateway
} from './approvalTypes';

export function createManagedClaraApprovalGateway(
  baseUrl: string,
  getToken: () => Promise<string>,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15000
): ClaraApprovalGateway {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/clara/approvals`;
  return {
    async apply(proposal, idempotencyKey) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const token = await getToken();
        if (controller.signal.aborted) throw new Error('Clara approval timed out.');
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ schemaVersion: 1, idempotencyKey, proposal }),
          signal: controller.signal
        });
        if (response.status === 409) throw new ClaraApprovalConflictError('Plan schedule changed.');
        if (!response.ok) throw new Error(`Clara approval failed with status ${response.status}`);
        const result = parseApprovalResult(await response.json());
        if (!result || result.idempotencyKey !== idempotencyKey || result.planId !== proposal.planId) {
          throw new Error('Clara approval response failed validation.');
        }
        return result;
      } finally {
        window.clearTimeout(timeout);
      }
    }
  };
}

export const managedClaraApprovalGateway = createManagedClaraApprovalGateway(
  import.meta.env.VITE_CLARA_API_URL || '',
  async () => {
    if (!auth.currentUser) throw new Error('Authentication required');
    return auth.currentUser.getIdToken();
  }
);
