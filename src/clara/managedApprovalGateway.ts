import { auth } from '../firebase/config';
import {
  ClaraApprovalConflictError,
  parseApprovalResult,
  type ClaraApprovalGateway
} from './approvalTypes';

export function createManagedClaraApprovalGateway(
  baseUrl: string,
  getToken: () => Promise<string>,
  fetcher: typeof fetch = fetch
): ClaraApprovalGateway {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/clara/approvals`;
  return {
    async apply(proposal, idempotencyKey) {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaVersion: 1, idempotencyKey, proposal })
      });
      if (response.status === 409) throw new ClaraApprovalConflictError('Plan schedule changed.');
      if (!response.ok) throw new Error(`Clara approval failed with status ${response.status}`);
      const result = parseApprovalResult(await response.json());
      if (!result || result.idempotencyKey !== idempotencyKey || result.planId !== proposal.planId) {
        throw new Error('Clara approval response failed validation.');
      }
      return result;
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
