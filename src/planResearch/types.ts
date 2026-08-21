import type { AuthUser } from '../auth/types';
import { toIso } from '../planRecord/types';

export type PlanResearchSourceDraft = {
  url: string;
  title: string;
  excerpt: string;
  note: string;
  topic: string;
};

export type ResearchWorkflowState = 'inbox' | 'reading' | 'useful' | 'archived';

export type ResearchSourceStateDraft = {
  note: string;
  topic: string;
  workflowState: ResearchWorkflowState;
  planIds: string[];
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

export type ResearchSourceState = {
  schemaVersion: 1;
  sourceId: string;
  ownerUid: string;
  workspaceId: 'default';
  note: string;
  topic: string;
  workflowState: ResearchWorkflowState;
  planIds: string[];
  revision: number;
  latestEventId: string;
  updatedAt: string;
};

export type WorkspaceResearchSource = { source: StoredResearchSource; state: ResearchSourceState };
export type PlanResearchSource = WorkspaceResearchSource;
export type PlanResearchSourceSaveResult = { value: WorkspaceResearchSource; duplicate: boolean };

export type WikiCitation = { sourceId: string; statement: string };
export type WikiDraft = { pageId: string; title: string; body: string; citations: WikiCitation[] };
export type WikiVersion = WikiDraft & {
  schemaVersion: 1;
  versionId: string;
  version: number;
  planId: string;
  ownerUid: string;
  workspaceId: 'default';
  requestFingerprint: string;
  recordedAt: string;
};
export type WikiPage = {
  schemaVersion: 1;
  pageId: string;
  planId: string;
  ownerUid: string;
  workspaceId: 'default';
  title: string;
  currentVersion: number;
  currentVersionId: string;
  updatedAt: string;
};
export type PlanResearchWikiSnapshot = {
  pages: { page: WikiPage; current: WikiVersion; versions: WikiVersion[] }[];
  briefVersion: number;
};
export type WikiBriefDraft = { focus: string; approach: string; successEvidence: string };

export interface PlanResearchSourceGateway {
  list(user: AuthUser, planIds: string[]): Promise<WorkspaceResearchSource[]>;
  save(user: AuthUser, requestId: string, draft: PlanResearchSourceDraft, state: ResearchSourceStateDraft): Promise<PlanResearchSourceSaveResult>;
  update(user: AuthUser, sourceId: string, eventId: string, expectedRevision: number, state: ResearchSourceStateDraft): Promise<PlanResearchSourceSaveResult>;
  loadWiki(user: AuthUser, planId: string): Promise<PlanResearchWikiSnapshot>;
  saveWiki(user: AuthUser, planId: string, versionId: string, expectedVersion: number, draft: WikiDraft): Promise<{ value: WikiVersion; duplicate: boolean }>;
  promoteWiki(user: AuthUser, planId: string, versionId: string, expectedBriefVersion: number, wikiVersionId: string, draft: WikiBriefDraft): Promise<{ version: number; duplicate: boolean }>;
}

export class DuplicateResearchSourceError extends Error {
  constructor() { super('This URL is already saved in your Research Library.'); this.name = 'DuplicateResearchSourceError'; }
}
export class PlanResearchConflictError extends Error {
  constructor(message = 'This research changed in another session.') { super(message); this.name = 'PlanResearchConflictError'; }
}
export class PlanResearchIdempotencyConflictError extends Error {
  constructor() { super('The save key was reused with different content.'); this.name = 'PlanResearchIdempotencyConflictError'; }
}

const textInRange = (value: unknown, minimum: number, maximum: number): value is string =>
  typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum;
const validId = (value: unknown, minimum = 1) => typeof value === 'string' && value.length >= minimum && value.length <= 128 && !value.includes('/');
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

export function normalizePlanIds(values: string[]): string[] | null {
  if (!Array.isArray(values)) return null;
  const normalized = [...new Set(values)].sort();
  return normalized.length <= 5 && normalized.every(value => validId(value)) ? normalized : null;
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

export function validateResearchSourceStateDraft(value: ResearchSourceStateDraft): boolean {
  return textInRange(value.note, 3, 1000) && textInRange(value.topic, 2, 120) &&
    ['inbox', 'reading', 'useful', 'archived'].includes(value.workflowState) && normalizePlanIds(value.planIds) !== null;
}

export function validateWikiDraft(value: WikiDraft): Partial<Record<'title' | 'body' | 'citations', string>> {
  const errors: Partial<Record<'title' | 'body' | 'citations', string>> = {};
  if (!validId(value.pageId, 8)) errors.title = 'Start a new page.';
  if (!textInRange(value.title, 3, 120)) errors.title = 'Use 3–120 characters.';
  if (!textInRange(value.body, 20, 5000)) errors.body = 'Use 20–5000 characters.';
  const sourceIds = value.citations.map(item => item.sourceId);
  if (value.citations.length < 1 || value.citations.length > 5 || new Set(sourceIds).size !== sourceIds.length ||
      value.citations.some(item => !validId(item.sourceId, 64) || !textInRange(item.statement, 10, 500))) {
    errors.citations = 'Add 1–5 distinct cited statements of 10–500 characters.';
  }
  return errors;
}

export function validateWikiBriefDraft(value: WikiBriefDraft) {
  const errors: Partial<Record<keyof WikiBriefDraft, string>> = {};
  if (!textInRange(value.focus, 3, 160)) errors.focus = 'Use 3–160 characters.';
  if (!textInRange(value.approach, 10, 1000)) errors.approach = 'Use 10–1000 characters.';
  if (!textInRange(value.successEvidence, 10, 600)) errors.successEvidence = 'Use 10–600 characters.';
  return errors;
}

export async function sourceIdForUrl(normalizedUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedUrl));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function sourceStateFingerprint(state: ResearchSourceStateDraft): string {
  return JSON.stringify([1, state.note.trim(), state.topic.trim(), state.workflowState, normalizePlanIds(state.planIds)]);
}
export function sourceCreateFingerprint(draft: PlanResearchSourceDraft, normalizedUrl: string, state: ResearchSourceStateDraft): string {
  return JSON.stringify([1, normalizedUrl, draft.title.trim(), draft.excerpt.trim(), sourceStateFingerprint(state)]);
}
export function wikiFingerprint(draft: WikiDraft): string {
  return JSON.stringify([1, draft.pageId, draft.title.trim(), draft.body.trim(), [...draft.citations].sort((a, b) => a.sourceId.localeCompare(b.sourceId))]);
}
export function wikiBriefFingerprint(wikiVersionId: string, draft: WikiBriefDraft): string {
  return JSON.stringify([1, wikiVersionId, draft.focus.trim(), draft.approach.trim(), draft.successEvidence.trim()]);
}

export function parseStoredResearchSource(value: unknown, sourceId: string, ownerUid: string): StoredResearchSource | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Partial<StoredResearchSource> & { capturedAt?: unknown };
  const capturedAt = toIso(source.capturedAt);
  if (source.schemaVersion !== 1 || source.sourceId !== sourceId || source.ownerUid !== ownerUid || source.workspaceId !== 'default' ||
      source.capturedBy !== 'user' || !capturedAt || !textInRange(source.url, 8, 1000) || !textInRange(source.normalizedUrl, 8, 1000) ||
      normalizeResearchUrl(source.url) !== source.normalizedUrl || !textInRange(source.domain, 3, 253) ||
      !textInRange(source.title, 3, 200) || !textInRange(source.excerpt, 10, 2000)) return null;
  return { ...source, capturedAt } as StoredResearchSource;
}

export function parseResearchSourceState(value: unknown, sourceId: string, ownerUid: string): ResearchSourceState | null {
  if (typeof value !== 'object' || value === null) return null;
  const state = value as Partial<ResearchSourceState> & { updatedAt?: unknown };
  const updatedAt = toIso(state.updatedAt);
  const draft = { note: state.note ?? '', topic: state.topic ?? '', workflowState: state.workflowState as ResearchWorkflowState, planIds: state.planIds ?? [] };
  if (state.schemaVersion !== 1 || state.sourceId !== sourceId || state.ownerUid !== ownerUid || state.workspaceId !== 'default' || !updatedAt ||
      !validateResearchSourceStateDraft(draft) || !Number.isInteger(state.revision) || (state.revision ?? 0) < 1 || !validId(state.latestEventId, 8)) return null;
  return { ...state, planIds: normalizePlanIds(state.planIds!)!, updatedAt } as ResearchSourceState;
}

export function parseWikiVersion(value: unknown, versionId: string, planId: string, ownerUid: string): WikiVersion | null {
  if (typeof value !== 'object' || value === null) return null;
  const version = value as Partial<WikiVersion> & { recordedAt?: unknown };
  const recordedAt = toIso(version.recordedAt);
  const draft = { pageId: version.pageId ?? '', title: version.title ?? '', body: version.body ?? '', citations: version.citations ?? [] };
  if (version.schemaVersion !== 1 || version.versionId !== versionId || version.planId !== planId || version.ownerUid !== ownerUid ||
      version.workspaceId !== 'default' || !recordedAt || !Number.isInteger(version.version) || (version.version ?? 0) < 1 ||
      Object.keys(validateWikiDraft(draft)).length > 0 || !textInRange(version.requestFingerprint, 1, 10000)) return null;
  return { ...version, ...draft, recordedAt } as WikiVersion;
}

export function parseWikiPage(value: unknown, pageId: string, planId: string, ownerUid: string): WikiPage | null {
  if (typeof value !== 'object' || value === null) return null;
  const page = value as Partial<WikiPage> & { updatedAt?: unknown };
  const updatedAt = toIso(page.updatedAt);
  if (page.schemaVersion !== 1 || page.pageId !== pageId || page.planId !== planId || page.ownerUid !== ownerUid || page.workspaceId !== 'default' ||
      !updatedAt || !textInRange(page.title, 3, 120) || !Number.isInteger(page.currentVersion) || (page.currentVersion ?? 0) < 1 ||
      !validId(page.currentVersionId, 8)) return null;
  return { ...page, updatedAt } as WikiPage;
}
