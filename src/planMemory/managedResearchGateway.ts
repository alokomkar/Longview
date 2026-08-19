import { auth } from '../firebase/config';
import { ResearchGatewayTimeoutError, type ResearchGateway } from './types';

type Identity = { getToken(): Promise<string> };
type IdentityProvider = () => Promise<Identity>;

export function createManagedResearchGateway(
  baseUrl: string,
  getIdentity: IdentityProvider,
  fetcher: typeof fetch = fetch
): ResearchGateway {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/clara/research`;
  return {
    async request(_user, request, signal) {
      const identity = await getIdentity();
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const token = await identity.getToken();
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal
      });
      if (response.status === 504) throw new ResearchGatewayTimeoutError();
      if (!response.ok) throw new Error(`Research request failed with status ${response.status}`);
      return response.json();
    }
  };
}

export const managedResearchGateway = createManagedResearchGateway(
  import.meta.env.VITE_CLARA_API_URL || '',
  async () => {
    if (!auth.currentUser) throw new Error('Authentication required.');
    const user = auth.currentUser;
    return { getToken: () => user.getIdToken() };
  }
);
