import { auth } from '../firebase/config';
import {
  ClaraGatewayTimeoutError,
  parseClaraRecommendation,
  type ClaraGateway,
  type ClaraRecommendation
} from './types';

type Identity = { uid: string; getToken(): Promise<string> };
type IdentityProvider = () => Promise<Identity>;
type Fetcher = typeof fetch;
type CacheOptions = { ttlMs?: number; maxPlans?: number; now?: () => number };

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CACHED_PLANS = 50;

export function createManagedClaraGateway(
  baseUrl: string,
  getIdentity: IdentityProvider,
  fetcher: Fetcher = fetch,
  cacheOptions: CacheOptions = {}
): ClaraGateway {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/clara/recommendations`;
  const ttlMs = cacheOptions.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const maxPlans = Math.max(1, cacheOptions.maxPlans ?? DEFAULT_CACHED_PLANS);
  const now = cacheOptions.now ?? Date.now;
  const cache = new Map<string, {
    contextSignature: string;
    expiresAt: number;
    recommendation: ClaraRecommendation;
  }>();

  const planCacheKey = (uid: string, planId: string) => JSON.stringify([uid, planId]);
  const contextSignature = (context: Parameters<ClaraGateway['recommend']>[0]) => JSON.stringify({
    schemaVersion: context.schemaVersion,
    scope: context.scope,
    plan: context.plan,
    step: context.step
  });

  return {
    async recommend(context, signal) {
      const identity = await getIdentity();
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const key = planCacheKey(identity.uid, context.plan.id);
      const signature = contextSignature(context);
      const cached = cache.get(key);
      if (cached && cached.contextSignature === signature && cached.expiresAt > now()) {
        cache.delete(key);
        cache.set(key, cached);
        return { ...cached.recommendation, requestId: context.requestId };
      }
      if (cached) cache.delete(key);

      const token = await identity.getToken();
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
      if (response.status === 504) throw new ClaraGatewayTimeoutError();
      if (!response.ok) throw new Error(`Clara request failed with status ${response.status}`);
      const value: unknown = await response.json();
      const recommendation = parseClaraRecommendation(value, context);
      if (recommendation && ttlMs > 0) {
        const timestamp = now();
        for (const [entryKey, entry] of cache) {
          if (entry.expiresAt <= timestamp) cache.delete(entryKey);
        }
        while (cache.size >= maxPlans) {
          const oldest = cache.keys().next().value as string | undefined;
          if (!oldest) break;
          cache.delete(oldest);
        }
        cache.set(key, { contextSignature: signature, expiresAt: timestamp + ttlMs, recommendation });
      }
      return value;
    }
  };
}

export const managedClaraGateway = createManagedClaraGateway(
  import.meta.env.VITE_CLARA_API_URL || '',
  async () => {
    if (!auth.currentUser) throw new Error('Authentication required');
    const user = auth.currentUser;
    return { uid: user.uid, getToken: () => user.getIdToken() };
  }
);
