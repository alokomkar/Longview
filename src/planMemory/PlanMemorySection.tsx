import { useMemo, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { Plan } from '../plan/types';
import { formatLongDate } from '../date/formatLongDate';
import {
  PlanBriefConflictError,
  PlanMemoryIdempotencyConflictError,
  ResearchConflictError,
  buildResearchRequest,
  proposalFromResearch,
  validatePlanBriefDraft,
  type PlanBriefDraft,
  type PlanMemoryGateway,
  type ResearchCandidate,
  type ResearchDecision,
  type ResearchGateway,
  type ReviewedResearch
} from './types';
import { usePlanMemory } from './usePlanMemory';
import { useResearchRequest, type ResearchFailure } from './useResearchRequest';

type SaveFailure = 'offline' | 'conflict' | 'idempotency' | 'unavailable' | null;
type PendingReview = {
  candidate: ResearchCandidate;
  decision: ResearchDecision;
  expectedRevision: number;
  reviewId: string;
};

const newId = (prefix: string) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;
const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit'
}).format(new Date(value));
const decisionLabel: Record<ResearchDecision, string> = {
  accepted: 'Accepted', rejected: 'Rejected', deferred: 'Not now'
};
const researchFailureCopy: Record<ResearchFailure, [string, string]> = {
  offline: ['You’re offline.', 'Saved research and the current Plan Brief remain available.'],
  timeout: ['Research took too long.', 'The request stopped safely. No new cards were added.'],
  malformed: ['This research could not be used.', 'Attribution or evidence was missing, so nothing was saved.'],
  unavailable: ['Research is unavailable.', 'Try again later. Saved research and the current Plan Brief are unchanged.']
};

export function PlanMemorySection({ user, plan, memoryGateway, researchGateway }: {
  user: AuthUser;
  plan: Plan;
  memoryGateway: PlanMemoryGateway;
  researchGateway: ResearchGateway;
}) {
  const memory = usePlanMemory(user, plan.id, memoryGateway, true);
  const researchRequest = useResearchRequest(user, researchGateway);
  const [tab, setTab] = useState<'research' | 'brief' | 'history'>('research');
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [reviewFailure, setReviewFailure] = useState<SaveFailure>(null);
  const [reviewDuplicate, setReviewDuplicate] = useState(false);
  const [briefStage, setBriefStage] = useState<'closed' | 'edit' | 'review' | 'saved'>('closed');
  const [briefDraft, setBriefDraft] = useState<PlanBriefDraft | null>(null);
  const [briefVersionId, setBriefVersionId] = useState('');
  const [briefFailure, setBriefFailure] = useState<SaveFailure>(null);
  const [briefDuplicate, setBriefDuplicate] = useState(false);

  const reviewed = memory.research.values ?? [];
  const reviewedById = useMemo(() => new Map(reviewed.map(value => [value.card.researchId, value])), [reviewed]);
  const transient = researchRequest.snapshot.status === 'ready' ? researchRequest.snapshot.response.cards : [];
  const displayed = useMemo(() => {
    const stored = reviewed.map(value => ({ candidate: value.card as ResearchCandidate, reviewed: value }));
    const storedIds = new Set(stored.map(value => value.candidate.researchId));
    return [...transient.filter(value => !storedIds.has(value.researchId)).map(candidate => ({ candidate, reviewed: null })), ...stored];
  }, [reviewed, transient]);
  const accepted = reviewed.filter(value => value.decision === 'accepted');
  const briefErrors = briefDraft ? validatePlanBriefDraft(briefDraft) : {};

  const askForResearch = () => {
    setTab('research');
    void researchRequest.request(buildResearchRequest(plan, reviewed.map(value => value.card.researchId), newId('research')));
  };
  const beginReview = (candidate: ResearchCandidate, decision: ResearchDecision) => {
    const existing = reviewedById.get(candidate.researchId);
    setPendingReview({ candidate, decision, expectedRevision: existing?.revision ?? 0, reviewId: newId('review') });
    setReviewFailure(null);
    setReviewDuplicate(false);
  };
  const confirmReview = async () => {
    if (!pendingReview) return;
    setReviewFailure(null);
    try {
      const result = await memory.review(
        pendingReview.reviewId,
        pendingReview.candidate,
        pendingReview.decision,
        pendingReview.expectedRevision
      );
      setReviewDuplicate(result.duplicate);
      setPendingReview(null);
    } catch (error) {
      setReviewFailure(error instanceof ResearchConflictError
        ? 'conflict' : error instanceof PlanMemoryIdempotencyConflictError
          ? 'idempotency' : navigator.onLine === false ? 'offline' : 'unavailable');
    }
  };
  const prepareBrief = () => {
    const draft = proposalFromResearch(plan, accepted);
    setBriefDraft(draft);
    setBriefVersionId(newId('brief'));
    setBriefFailure(null);
    setBriefDuplicate(false);
    setBriefStage('edit');
    setTab('brief');
  };
  const saveBrief = async () => {
    if (!briefDraft || Object.keys(validatePlanBriefDraft(briefDraft)).length > 0) return;
    setBriefFailure(null);
    try {
      const result = await memory.saveBrief(briefVersionId, briefDraft, memory.brief.version);
      setBriefDuplicate(result.duplicate);
      setBriefStage('saved');
    } catch (error) {
      setBriefFailure(error instanceof PlanBriefConflictError
        ? 'conflict' : error instanceof PlanMemoryIdempotencyConflictError
          ? 'idempotency' : navigator.onLine === false ? 'offline' : 'unavailable');
    }
  };

  return <section className="detail-section memory-section">
    <div className="record-heading"><div><span className="status">Research and Plan Brief</span><h2>Turn reviewed evidence into a Plan Brief.</h2><p>Research never changes the current brief by itself.</p></div><button onClick={askForResearch}>Find new research</button></div>
    <div className="context-grid memory-tabs" role="tablist" aria-label="Research and Plan Brief sections">
      <button role="tab" aria-selected={tab === 'research'} className={tab === 'research' ? '' : 'secondary'} onClick={() => setTab('research')}>Research</button>
      <button role="tab" aria-selected={tab === 'brief'} className={tab === 'brief' ? '' : 'secondary'} onClick={() => setTab('brief')}>Current Plan Brief</button>
      <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? '' : 'secondary'} onClick={() => setTab('history')}>Version history</button>
    </div>

    {researchRequest.snapshot.status === 'loading' && <article className="plan-card memory-progress" aria-busy="true"><span className="status">Research · read only</span><h3>Finding attributed evidence…</h3><p>Your saved research and current Plan Brief remain unchanged.</p><div className="clara-progress" role="progressbar" aria-label="Finding attributed research"><span /></div><button className="secondary" onClick={researchRequest.cancel}>Cancel research</button></article>}
    {researchRequest.snapshot.status === 'error' && <ResearchFailureNotice failure={researchRequest.snapshot.failure} onRetry={researchRequest.retry} onClose={researchRequest.clear} />}

    {pendingReview && <article className="plan-card record-review" aria-busy={memory.reviewSaving}><span className="status">Review evidence decision</span><h3>{decisionLabel[pendingReview.decision]} this research?</h3><p>{pendingReview.candidate.headline}</p><ResearchAttribution candidate={pendingReview.candidate} /><small>This records your decision. It does not update the Plan Brief.</small>{reviewFailure && <SaveFailureNotice failure={reviewFailure} kind="review" />}{reviewFailure === 'conflict' && <button className="secondary" onClick={() => { memory.retryResearch(); setPendingReview(null); setReviewFailure(null); }}>View current research</button>}{reviewFailure === 'idempotency' && <button className="secondary" onClick={() => { setPendingReview(current => current ? { ...current, reviewId: newId('review') } : current); setReviewFailure(null); }}>Start a new review</button>}<div className="actions"><button disabled={memory.reviewSaving || reviewFailure === 'conflict' || reviewFailure === 'idempotency'} onClick={() => void confirmReview()}>{memory.reviewSaving ? 'Saving review…' : `Confirm ${decisionLabel[pendingReview.decision].toLowerCase()}`}</button><button className="secondary" disabled={memory.reviewSaving} onClick={() => { setPendingReview(null); setReviewFailure(null); }}>Cancel review</button></div></article>}
    {reviewDuplicate && <div className="notice success" role="status"><strong>Review already saved once.</strong><p>The original result was restored; no duplicate review was added.</p></div>}

    {tab === 'research' && <ResearchPanel
      status={memory.research.status}
      values={displayed}
      onRetry={memory.retryResearch}
      onReview={beginReview}
      acceptedCount={accepted.length}
      onPrepare={prepareBrief}
      onFind={askForResearch}
    />}
    {tab === 'brief' && <BriefPanel
      status={memory.brief.status}
      current={memory.brief.current}
      version={memory.brief.version}
      stage={briefStage}
      draft={briefDraft}
      errors={briefErrors}
      saving={memory.briefSaving}
      failure={briefFailure}
      duplicate={briefDuplicate}
      accepted={accepted}
      onRetry={memory.retryBrief}
      onPrepare={prepareBrief}
      onDraft={setBriefDraft}
      onStage={setBriefStage}
      onSave={() => void saveBrief()}
      onConflict={() => { memory.retryBrief(); setBriefStage('closed'); setBriefFailure(null); }}
      onRestartSave={() => { setBriefVersionId(newId('brief')); setBriefFailure(null); }}
    />}
    {tab === 'history' && <HistoryPanel status={memory.brief.status} versions={memory.brief.versions ?? []} onRetry={memory.retryBrief} />}
  </section>;
}

function ResearchPanel({ status, values, onRetry, onReview, acceptedCount, onPrepare, onFind }: {
  status: 'idle' | 'loading' | 'ready' | 'error';
  values: { candidate: ResearchCandidate; reviewed: ReviewedResearch | null }[];
  onRetry: () => void;
  onReview: (candidate: ResearchCandidate, decision: ResearchDecision) => void;
  acceptedCount: number;
  onPrepare: () => void;
  onFind: () => void;
}) {
  if ((status === 'idle' || status === 'loading') && values.length === 0) return <div className="record-state" aria-busy="true"><div className="clara-progress" role="progressbar" aria-label="Loading saved research"><span /></div><p>Loading saved research…</p></div>;
  return <div className="memory-list">
    {status === 'error' && <div className="notice" role="alert"><strong>Saved research couldn’t be refreshed.</strong><p>{values.length ? 'The last confirmed cards remain visible.' : 'The current Plan Brief remains available; no stale cards are shown.'}</p><button onClick={onRetry}>Try research cards again</button></div>}
    {values.length === 0 && <div className="record-state"><p>No reviewed research is saved for this Plan yet.</p><button onClick={onFind}>Find attributed research</button></div>}
    {values.map(({ candidate, reviewed }) => <article className="plan-card research-card" key={candidate.researchId}>
      <span className="status">{reviewed ? decisionLabel[reviewed.decision] : 'Pending review'}{reviewed ? ` · revision ${reviewed.revision}` : ''}</span>
      <h3>{candidate.headline}</h3><p>{candidate.finding}</p><ResearchAttribution candidate={candidate} />
      <div className="research-actions"><button onClick={() => onReview(candidate, 'accepted')}>Accept</button><button className="secondary" onClick={() => onReview(candidate, 'rejected')}>Reject</button><button className="secondary" onClick={() => onReview(candidate, 'deferred')}>Not now</button></div>
    </article>)}
    <button disabled={acceptedCount === 0} onClick={onPrepare}>{acceptedCount === 0 ? 'Accept research to prepare a brief' : `Prepare Plan Brief from ${acceptedCount} accepted ${acceptedCount === 1 ? 'card' : 'cards'}`}</button>
  </div>;
}

function ResearchAttribution({ candidate }: { candidate: ResearchCandidate }) {
  const source = candidate.source;
  return <div className="research-attribution"><strong>Source</strong>{source.kind === 'web'
    ? <a href={source.locator} target="_blank" rel="noreferrer">{source.title}</a>
    : <span>{source.title}</span>}<small>{source.domain ? `${source.domain} · ` : ''}Retrieved {dateTime(source.retrievedAt)}</small>
    {source.kind === 'web' && source.searchQueries?.length ? <small>Google Search suggestions: {source.searchQueries.join(' · ')}</small> : null}</div>;
}

function BriefPanel({ status, current, version, stage, draft, errors, saving, failure, duplicate, accepted, onRetry, onPrepare, onDraft, onStage, onSave, onConflict, onRestartSave }: {
  status: 'idle' | 'loading' | 'ready' | 'error';
  current: ReturnType<typeof usePlanMemory>['brief']['current'];
  version: number;
  stage: 'closed' | 'edit' | 'review' | 'saved';
  draft: PlanBriefDraft | null;
  errors: Partial<Record<keyof PlanBriefDraft, string>>;
  saving: boolean;
  failure: SaveFailure;
  duplicate: boolean;
  accepted: ReviewedResearch[];
  onRetry: () => void;
  onPrepare: () => void;
  onDraft: (value: PlanBriefDraft) => void;
  onStage: (value: 'closed' | 'edit' | 'review' | 'saved') => void;
  onSave: () => void;
  onConflict: () => void;
  onRestartSave: () => void;
}) {
  if ((status === 'idle' || status === 'loading') && !current && stage === 'closed') return <div className="record-state" aria-busy="true"><div className="clara-progress" role="progressbar" aria-label="Loading current Plan Brief"><span /></div><p>Loading the current Plan Brief…</p></div>;
  if (stage === 'edit' && draft) return <article className="plan-card record-review"><span className="status">Editable proposal · not saved</span><h3>Prepare Plan Brief version {version + 1}</h3><label>Focus<input maxLength={160} value={draft.focus} onChange={event => onDraft({ ...draft, focus: event.target.value })} /></label>{errors.focus && <small role="alert">{errors.focus}</small>}<label>Approach<textarea maxLength={1000} value={draft.approach} onChange={event => onDraft({ ...draft, approach: event.target.value })} /></label>{errors.approach && <small role="alert">{errors.approach}</small>}<label>Success evidence<textarea maxLength={600} value={draft.successEvidence} onChange={event => onDraft({ ...draft, successEvidence: event.target.value })} /></label>{errors.successEvidence && <small role="alert">{errors.successEvidence}</small>}<p><strong>Evidence:</strong> {draft.sourceResearchIds.length} accepted {draft.sourceResearchIds.length === 1 ? 'card' : 'cards'}.</p><div className="actions"><button disabled={Object.keys(errors).length > 0} onClick={() => onStage('review')}>Review Plan Brief</button><button className="secondary" onClick={() => onStage('closed')}>Not now</button></div></article>;
  if (stage === 'review' && draft) return <article className="plan-card record-review" aria-busy={saving}><span className="status">Review Plan Brief version {version + 1}</span><h3>{draft.focus.trim()}</h3><p><strong>Approach:</strong> {draft.approach.trim()}</p><p><strong>Success evidence:</strong> {draft.successEvidence.trim()}</p><small>{draft.sourceResearchIds.length} accepted research {draft.sourceResearchIds.length === 1 ? 'card' : 'cards'} · expected current version {version}</small>{failure && <SaveFailureNotice failure={failure} kind="brief" />}{failure === 'conflict' && <button className="secondary" onClick={onConflict}>View current version</button>}{failure === 'idempotency' && <button className="secondary" onClick={onRestartSave}>Start a new save</button>}<div className="actions"><button disabled={saving || failure === 'conflict' || failure === 'idempotency'} onClick={onSave}>{saving ? 'Saving Plan Brief…' : `Save version ${version + 1}`}</button><button className="secondary" disabled={saving} onClick={() => onStage('edit')}>Edit proposal</button><button className="secondary" disabled={saving} onClick={() => onStage('closed')}>Cancel without saving</button></div></article>;
  return <div className="memory-list">
    {status === 'error' && <div className="notice" role="alert"><strong>The current Plan Brief couldn’t be refreshed.</strong><p>{current ? 'The last confirmed version remains visible.' : 'Saved research remains available; no stale brief is shown.'}</p><button onClick={onRetry}>Try current Plan Brief again</button></div>}
    {stage === 'saved' && <div className="notice success" role="status"><strong>{duplicate ? 'Plan Brief already saved once.' : 'Plan Brief saved.'}</strong><p>{duplicate ? 'The original version was restored; no duplicate was added.' : 'The approved version is now current.'}</p></div>}
    {current ? <article className="plan-card brief-card"><span className="status">Current · version {current.version}</span><h3>{current.focus}</h3><p><strong>Approach:</strong> {current.approach}</p><p><strong>Success evidence:</strong> {current.successEvidence}</p><small>{current.sourceResearchIds.length} attributed {current.sourceResearchIds.length === 1 ? 'source' : 'sources'} · saved {dateTime(current.recordedAt)}</small></article> : <div className="record-state"><p>No Plan Brief version has been approved yet.</p></div>}
    <button disabled={accepted.length === 0} onClick={onPrepare}>{current ? 'Prepare a new version' : 'Prepare Plan Brief'}</button>
  </div>;
}

function HistoryPanel({ status, versions, onRetry }: { status: string; versions: NonNullable<ReturnType<typeof usePlanMemory>['brief']['versions']>; onRetry: () => void }) {
  return <div className="memory-list">{status === 'error' && <div className="notice" role="alert"><strong>Version history couldn’t be refreshed.</strong><button onClick={onRetry}>Try version history again</button></div>}{versions.length === 0 ? <div className="record-state"><p>No Plan Brief versions have been saved yet.</p></div> : <ol className="record-list">{versions.map((brief, index) => <li key={brief.versionId}><article className="plan-card"><span className="status">Version {brief.version}{index === 0 ? ' · current' : ''}</span><h3>{brief.focus}</h3><p>{brief.approach}</p><small>{brief.sourceResearchIds.length} attributed {brief.sourceResearchIds.length === 1 ? 'source' : 'sources'} · {dateTime(brief.recordedAt)}</small></article></li>)}</ol>}</div>;
}

function ResearchFailureNotice({ failure, onRetry, onClose }: { failure: ResearchFailure; onRetry: () => void; onClose: () => void }) {
  const copy = researchFailureCopy[failure];
  return <div className="notice" role="alert"><strong>{copy[0]}</strong><p>{copy[1]}</p><div className="actions"><button onClick={onRetry}>Try research again</button><button className="secondary" onClick={onClose}>Close</button></div></div>;
}

function SaveFailureNotice({ failure, kind }: { failure: Exclude<SaveFailure, null>; kind: 'review' | 'brief' }) {
  const copy = failure === 'offline'
    ? ['You’re offline.', `Reconnect and retry. The ${kind === 'brief' ? 'edited proposal' : 'review choice'} remains here.`]
    : failure === 'conflict'
      ? [kind === 'brief' ? 'A newer Plan Brief already exists.' : 'This research changed in another tab.', 'Your change was not written over the newer version.']
      : failure === 'idempotency'
        ? ['This request no longer matches its review.', 'Start a new review. Confirmed work is unchanged.']
        : [`The ${kind === 'brief' ? 'Plan Brief' : 'review'} could not be confirmed.`, 'Retry the same save. Longview will restore it if it already succeeded.'];
  return <div className="notice" role="alert"><strong>{copy[0]}</strong><p>{copy[1]}</p></div>;
}
