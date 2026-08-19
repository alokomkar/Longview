import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type {
  PlanBriefDraft,
  PlanBriefSaveResult,
  PlanBriefVersion,
  PlanMemoryGateway,
  ResearchCandidate,
  ResearchDecision,
  ResearchReviewResult,
  ReviewedResearch
} from './types';

type ResearchSnapshot =
  | { status: 'idle' | 'loading' | 'error'; values: ReviewedResearch[] | null }
  | { status: 'ready'; values: ReviewedResearch[] };
type BriefSnapshot =
  | { status: 'idle' | 'loading' | 'error'; versions: PlanBriefVersion[] | null; current: PlanBriefVersion | null; version: number }
  | { status: 'ready'; versions: PlanBriefVersion[]; current: PlanBriefVersion | null; version: number };

export function usePlanMemory(user: AuthUser, planId: string | null, gateway: PlanMemoryGateway, enabled: boolean) {
  const [research, setResearch] = useState<ResearchSnapshot>({ status: 'idle', values: null });
  const [brief, setBrief] = useState<BriefSnapshot>({ status: 'idle', versions: null, current: null, version: 0 });
  const [researchAttempt, setResearchAttempt] = useState(0);
  const [briefAttempt, setBriefAttempt] = useState(0);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [briefSaving, setBriefSaving] = useState(false);
  const activePlan = useRef(planId);

  useEffect(() => {
    activePlan.current = planId;
    if (!enabled || !planId) {
      setResearch({ status: 'idle', values: null });
      return;
    }
    let active = true;
    setResearch(current => ({ status: 'loading', values: current.values }));
    gateway.loadResearch(user, planId).then(
      values => { if (active && activePlan.current === planId) setResearch({ status: 'ready', values }); },
      () => { if (active && activePlan.current === planId) setResearch(current => ({ status: 'error', values: current.values })); }
    );
    return () => { active = false; };
  }, [enabled, gateway, planId, researchAttempt, user]);

  useEffect(() => {
    if (!enabled || !planId) {
      setBrief({ status: 'idle', versions: null, current: null, version: 0 });
      return;
    }
    let active = true;
    setBrief(current => ({ status: 'loading', versions: current.versions, current: current.current, version: current.version }));
    gateway.loadBrief(user, planId).then(
      value => { if (active && activePlan.current === planId) setBrief({ status: 'ready', versions: value.briefVersions, current: value.currentBrief, version: value.briefVersion }); },
      () => { if (active && activePlan.current === planId) setBrief(current => ({ status: 'error', versions: current.versions, current: current.current, version: current.version })); }
    );
    return () => { active = false; };
  }, [briefAttempt, enabled, gateway, planId, user]);

  const retryResearch = useCallback(() => setResearchAttempt(value => value + 1), []);
  const retryBrief = useCallback(() => setBriefAttempt(value => value + 1), []);

  const review = useCallback(async (
    reviewId: string,
    candidate: ResearchCandidate,
    decision: ResearchDecision,
    expectedRevision: number
  ): Promise<ResearchReviewResult> => {
    if (!planId || reviewSaving) throw new Error('Research review is unavailable.');
    setReviewSaving(true);
    try {
      const result = await gateway.reviewResearch(user, planId, reviewId, candidate, decision, expectedRevision);
      const values = await gateway.loadResearch(user, planId);
      if (activePlan.current === planId) setResearch({ status: 'ready', values });
      return result;
    } finally {
      setReviewSaving(false);
    }
  }, [gateway, planId, reviewSaving, user]);

  const saveBrief = useCallback(async (
    versionId: string,
    draft: PlanBriefDraft,
    expectedVersion: number
  ): Promise<PlanBriefSaveResult> => {
    if (!planId || briefSaving) throw new Error('Plan Brief save is unavailable.');
    setBriefSaving(true);
    try {
      const result = await gateway.saveBrief(user, planId, versionId, draft, expectedVersion);
      const value = await gateway.loadBrief(user, planId);
      if (activePlan.current === planId) setBrief({ status: 'ready', versions: value.briefVersions, current: value.currentBrief, version: value.briefVersion });
      return result;
    } finally {
      setBriefSaving(false);
    }
  }, [briefSaving, gateway, planId, user]);

  return { research, brief, reviewSaving, briefSaving, retryResearch, retryBrief, review, saveBrief };
}
