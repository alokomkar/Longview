import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type {
  PlanResearchSourceDraft,
  PlanResearchSourceGateway,
  PlanResearchWikiSnapshot,
  ResearchSourceStateDraft,
  WikiBriefDraft,
  WikiDraft,
  WorkspaceResearchSource
} from './types';

type Snapshot =
  | { status: 'loading' | 'error'; values: WorkspaceResearchSource[] | null; wiki: PlanResearchWikiSnapshot | null }
  | { status: 'ready'; values: WorkspaceResearchSource[]; wiki: PlanResearchWikiSnapshot };

export function usePlanResearchSources(user: AuthUser, planId: string, planIds: string[], gateway: PlanResearchSourceGateway) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: 'loading', values: null, wiki: null });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const activePlan = useRef(planId);
  const planKey = [...planIds].sort().join('|');

  const load = useCallback(async () => {
    const [values, wiki] = await Promise.all([gateway.list(user, planIds), gateway.loadWiki(user, planId)]);
    return { values, wiki };
  }, [gateway, planId, planKey, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    activePlan.current = planId;
    let active = true;
    setSnapshot(current => ({ status: 'loading', values: current.values, wiki: current.wiki }));
    load().then(
      value => { if (active && activePlan.current === planId) setSnapshot({ status: 'ready', ...value }); },
      () => { if (active && activePlan.current === planId) setSnapshot(current => ({ status: 'error', values: current.values, wiki: current.wiki })); }
    );
    return () => { active = false; };
  }, [attempt, load, planId]);

  const refresh = useCallback(async () => {
    const value = await load();
    if (activePlan.current === planId) setSnapshot({ status: 'ready', ...value });
  }, [load, planId]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const run = useCallback(async <T,>(action: () => Promise<T>) => {
    if (saving) throw new Error('A research change is already being saved.');
    setSaving(true);
    try {
      const result = await action();
      await refresh();
      return result;
    } finally {
      setSaving(false);
    }
  }, [refresh, saving]);

  const save = useCallback((requestId: string, draft: PlanResearchSourceDraft, state: ResearchSourceStateDraft) =>
    run(() => gateway.save(user, requestId, draft, state)), [gateway, run, user]);
  const update = useCallback((sourceId: string, eventId: string, expectedRevision: number, state: ResearchSourceStateDraft) =>
    run(() => gateway.update(user, sourceId, eventId, expectedRevision, state)), [gateway, run, user]);
  const saveWiki = useCallback((versionId: string, expectedVersion: number, draft: WikiDraft) =>
    run(() => gateway.saveWiki(user, planId, versionId, expectedVersion, draft)), [gateway, planId, run, user]);
  const promoteWiki = useCallback((versionId: string, expectedBriefVersion: number, wikiVersionId: string, draft: WikiBriefDraft) =>
    run(() => gateway.promoteWiki(user, planId, versionId, expectedBriefVersion, wikiVersionId, draft)), [gateway, planId, run, user]);

  return { snapshot, saving, retry, save, update, saveWiki, promoteWiki };
}
