import type { AuthUser } from '../auth/types';
import { toIso } from '../planRecord/types';

export type PlanResearchSourceDraft = {
  url: string;
  title: string;
  excerpt: string;
  note: string;
  topic: string;
};

export type StoredResearchSource = {
  schemaVersion: 1;
  sourceId: string;
  ownerUid: string;
  workspaceId: 'default';
  url: string;
  normalizedUrl: string;
  domain: string;
  title: string;
  excerpt: string;
  capturedBy: 'user';
  capturedAt: string;
};

export type PlanSourceLink = {
  schemaVersion: 1;
  sourceId: string;
  planId: string;
  ownerUid: string;
  workspaceId: 'default';
  note: string;
  topic: string;
  state: 'inbox';
  requestId: string;
  requestFingerprint: string;
  createdAt: string;
};

export type PlanResearchSource = { source: StoredResearchSource; link: PlanSourceLink };
export type PlanResearchSourceSaveResult = { value: PlanResearchSource; duplicate: boolean };

export interface PlanResearchSourceGateway {
  list(user: AuthUser, planId: string): Promise<PlanResearchSource[]>;
  save(user: AuthUser, planId: string, requestId: string, draft: PlanResearchSourceDraft): Promise<PlanResearchSourceSaveResult>;
}

export class DuplicateResearchSourceError extends Error {
  constructor() { super('This URL is already saved to this Plan.'); this.name = 'DuplicateResearchSourceError'; }
}

export class PlanResearchIdempotencyConflictError extends Error {
  constructor() { super('The save key was reused with different source content.'); this.name = 'PlanResearchIdempotencyConflictError'; }
}

const textInRange = (value: unknown, minimum: number, maximum: number): value is string =>
  typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum;
const privateIpv4 = (host: string) => {
  const values = host.split('.').map(Number);
  if (values.length !== 4 || values.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  return values[0] === 0 || values[0] === 10 || values[0] === 127 ||
    (values[0] === 169 && values[1] === 254) ||
    (values[0] === 172 && values[1] >= 16 && values[1] <= 31) ||
    (values[0] === 192 && values[1] === 168);
};
const privateHost = (host: string) => host === 'localhost' || host.endsWith('.localhost') ||
  host.endsWith('.local') || host.endsWith('.internal') || host.includes(':') || privateIpv4(host);

export function normalizeResearchUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || privateHost(parsed.hostname.toLowerCase())) return null;
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || ['fbclid', 'gclid'].includes(key.toLowerCase())) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    const normalized = parsed.toString();
    return normalized.length <= 1000 ? normalized : null;
  } catch {
    return null;
  }
}

export function validatePlanResearchSourceDraft(draft: PlanResearchSourceDraft) {
  const errors: Partial<Record<keyof PlanResearchSourceDraft, string>> = {};
  if (!normalizeResearchUrl(draft.url)) errors.url = 'Use a public HTTPS URL without sign-in details.';
  if (!textInRange(draft.title, 3, 200)) errors.title = 'Use 3–200 characters.';
  if (!textInRange(draft.excerpt, 10, 2000)) errors.excerpt = 'Use 10–2000 characters.';
  if (!textInRange(draft.note, 3, 1000)) errors.note = 'Use 3–1000 characters.';
  if (!textInRange(draft.topic, 2, 120)) errors.topic = 'Use 2–120 characters.';
  return errors;
}

export async function sourceIdForUrl(normalizedUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedUrl));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function planSourceLinkFingerprint(draft: PlanResearchSourceDraft, normalizedUrl: string): string {
  return JSON.stringify([1, normalizedUrl, draft.title.trim(), draft.excerpt.trim(), draft.note.trim(), draft.topic.trim()]);
}

export function parseStoredResearchSource(value: unknown, sourceId: string, ownerUid: string): StoredResearchSource | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Partial<StoredResearchSource> & { capturedAt?: unknown };
  const capturedAt = toIso(source.capturedAt);
  if (source.schemaVersion !== 1 || source.sourceId !== sourceId || source.ownerUid !== ownerUid ||
      source.workspaceId !== 'default' || source.capturedBy !== 'user' || !capturedAt ||
      !textInRange(source.url, 8, 1000) || !textInRange(source.normalizedUrl, 8, 1000) ||
      normalizeResearchUrl(source.url) !== source.normalizedUrl || !textInRange(source.domain, 3, 253) ||
      !textInRange(source.title, 3, 200) || !textInRange(source.excerpt, 10, 2000)) return null;
  return { ...source, capturedAt } as StoredResearchSource;
}

export function parsePlanSourceLink(value: unknown, sourceId: string, planId: string, ownerUid: string): PlanSourceLink | null {
  if (typeof value !== 'object' || value === null) return null;
  const link = value as Partial<PlanSourceLink> & { createdAt?: unknown };
  const createdAt = toIso(link.createdAt);
  if (link.schemaVersion !== 1 || link.sourceId !== sourceId || link.planId !== planId || link.ownerUid !== ownerUid ||
      link.workspaceId !== 'default' || link.state !== 'inbox' || !createdAt ||
      !textInRange(link.note, 3, 1000) || !textInRange(link.topic, 2, 120) ||
      !textInRange(link.requestId, 8, 128) || !textInRange(link.requestFingerprint, 1, 5000)) return null;
  return { ...link, createdAt } as PlanSourceLink;
}
