import { auth } from '../firebase/config';
import type { ClaraGateway } from './types';

type TokenProvider = () => Promise<string>;
type Fetcher = typeof fetch;

export function createManagedClaraGateway(
  baseUrl: string,
  getToken: TokenProvider,
  fetcher: Fetcher = fetch
): ClaraGateway {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/clara/recommendations`;
  return {
    async recommend(context, signal) {
      const token = await getToken();
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(context),
        signal
      });
      if (!response.ok) throw new Error(`Clara request failed with status ${response.status}`);
      return response.json();
    }
  };
}

export const managedClaraGateway = createManagedClaraGateway(
  import.meta.env.VITE_CLARA_API_URL || '',
  async () => {
    if (!auth.currentUser) throw new Error('Authentication required');
    return auth.currentUser.getIdToken();
  }
);
