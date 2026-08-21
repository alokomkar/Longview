import { auth } from '../firebase/config';
import { PlanMatchTimeoutError, type PlanMatchGateway } from './matching';

type Identity = { getToken(): Promise<string> };
type IdentityProvider = () => Promise<Identity>;

export function createManagedPlanMatchGateway(baseUrl: string, getIdentity: IdentityProvider, fetcher: typeof fetch = fetch): PlanMatchGateway {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/clara/plan-matches`;
  return {
    async match(_user, request, signal) {
      const identity = await getIdentity();
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const response = await fetcher(endpoint, {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${await identity.getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      if (response.status === 504) throw new PlanMatchTimeoutError();
      if (!response.ok) throw new Error(`Plan matching failed with status ${response.status}`);
      return response.json();
    }
  };
}

export const managedPlanMatchGateway = createManagedPlanMatchGateway(import.meta.env.VITE_CLARA_API_URL || '', async () => {
  if (!auth.currentUser) throw new Error('Authentication required.');
  const user = auth.currentUser;
  return { getToken: () => user.getIdToken() };
});
