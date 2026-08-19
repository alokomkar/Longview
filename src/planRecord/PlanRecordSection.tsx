import { useEffect, useMemo, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { ClaraRecommendation } from '../clara/types';
import {
  PlanRecordConflictError,
  draftFromRecommendation,
  validatePlanRecordDraft,
  type PlanRecordDraft,
  type PlanRecordGateway
} from './types';
import { usePlanRecords } from './usePlanRecords';

type DecisionStage = 'closed' | 'edit' | 'review' | 'saved';
type SaveFailure = 'offline' | 'conflict' | 'unavailable' | null;

const newRecordId = () => globalThis.crypto?.randomUUID?.() ?? `record-${Date.now()}`;
const emptyDecision = (): PlanRecordDraft => ({
  kind: 'decision', summary: '', rationale: '', confidence: null, sourceFacts: [], sourceRecommendationId: null
});
const displayTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit'
}).format(new Date(value));

export function PlanRecordSection({ user, planId, gateway, guidance, onCancelGuidance, onGuidanceSaved }: {
  user: AuthUser;
  planId: string;
  gateway: PlanRecordGateway;
  guidance: ClaraRecommendation | null;
  onCancelGuidance: () => void;
  onGuidanceSaved: () => void;
}) {
  const records = usePlanRecords(user, planId, gateway, true);
  const [tab, setTab] = useState<'history' | 'decisions' | 'guidance'>('history');
  const [decisionStage, setDecisionStage] = useState<DecisionStage>('closed');
  const [decision, setDecision] = useState<PlanRecordDraft>(emptyDecision);
  const [recordId, setRecordId] = useState('');
  const [guidanceRecordId, setGuidanceRecordId] = useState('');
  const [failure, setFailure] = useState<SaveFailure>(null);
  const [duplicate, setDuplicate] = useState(false);
  const guidanceDraft = useMemo(() => guidance ? draftFromRecommendation(guidance) : null, [guidance]);
  useEffect(() => {
    if (guidance) {
      setGuidanceRecordId(newRecordId());
      setFailure(null);
      setDuplicate(false);
      setTab('guidance');
    }
  }, [guidance]);

  const startDecision = () => {
    setDecision(emptyDecision());
    setRecordId(newRecordId());
    setFailure(null);
    setDuplicate(false);
    setDecisionStage('edit');
    setTab('decisions');
  };
  const reviewDecision = () => {
    if (Object.keys(validatePlanRecordDraft(decision)).length === 0) setDecisionStage('review');
  };
  const save = async (draft: PlanRecordDraft, id: string, onSaved: () => void) => {
    setFailure(null);
    try {
      const result = await records.create(id, draft);
      setDuplicate(result.duplicate);
      onSaved();
    } catch (error) {
      setFailure(error instanceof PlanRecordConflictError
        ? 'conflict'
        : navigator.onLine === false ? 'offline' : 'unavailable');
    }
  };
  const decisionErrors = validatePlanRecordDraft(decision);
  const bundle = records.snapshot.bundle;
  const decisions = bundle?.records.filter(record => record.kind === 'decision') ?? [];
  const savedGuidance = bundle?.records.filter(record => record.kind === 'clara-guidance') ?? [];

  return <section className="detail-section record-section">
    <div className="record-heading"><div><span className="status">Plan record</span><h2>What happened, and why.</h2><p>Only confirmed progress and choices appear here.</p></div><button onClick={startDecision}>Add decision</button></div>
    <div className="context-grid" role="tablist" aria-label="Plan record sections">
      <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? '' : 'secondary'} onClick={() => setTab('history')}>Execution history</button>
      <button role="tab" aria-selected={tab === 'decisions'} className={tab === 'decisions' ? '' : 'secondary'} onClick={() => setTab('decisions')}>Decisions</button>
      <button role="tab" aria-selected={tab === 'guidance'} className={tab === 'guidance' ? '' : 'secondary'} onClick={() => setTab('guidance')}>Saved guidance</button>
    </div>

    {records.snapshot.status === 'loading' && !bundle && <div className="record-state" aria-busy="true"><div className="clara-progress" role="progressbar" aria-label="Loading Plan record"><span /></div><p>Loading this Plan’s confirmed record…</p></div>}
    {records.snapshot.status === 'error' && <div className="notice" role="alert"><strong>The Plan record couldn’t be refreshed.</strong><p>{bundle ? 'The last confirmed record remains visible.' : 'Plan details remain available, but record entries are hidden until the connection returns.'}</p><button onClick={records.retry}>Try record again</button></div>}

    {guidanceDraft && <article className="plan-card record-review" aria-busy={records.saving}>
      <span className="status">Review saved guidance</span><h3>Keep this recommendation with the Plan?</h3>
      <p>{guidanceDraft.summary}</p><p><strong>Why:</strong> {guidanceDraft.rationale}</p>
      <dl><div><dt>Confidence</dt><dd>{guidanceDraft.confidence}</dd></div>{guidanceDraft.sourceFacts.map(fact => <div key={fact}><dt>Context used</dt><dd>{fact}</dd></div>)}</dl>
      <small>This saves the recommendation as read-only context. It does not change the Plan.</small>
      {failure && <RecordFailure failure={failure} />}
      <div className="actions"><button disabled={records.saving} onClick={() => void save(guidanceDraft, guidanceRecordId, () => { setTab('guidance'); onGuidanceSaved(); })}>{records.saving ? 'Saving guidance…' : 'Save to this Plan'}</button><button className="secondary" disabled={records.saving} onClick={onCancelGuidance}>Keep recommendation unsaved</button></div>
    </article>}

    {decisionStage === 'edit' && <article className="plan-card record-review"><span className="status">Add decision</span><h3>What did you decide?</h3><label>Decision<textarea maxLength={500} value={decision.summary} onChange={event => setDecision(current => ({ ...current, summary: event.target.value }))} /></label>{decisionErrors.summary && <small role="alert">{decisionErrors.summary}</small>}<label>Why this choice?<textarea maxLength={500} value={decision.rationale} onChange={event => setDecision(current => ({ ...current, rationale: event.target.value }))} /></label>{decisionErrors.rationale && <small role="alert">{decisionErrors.rationale}</small>}<div className="actions"><button onClick={reviewDecision}>Review decision</button><button className="secondary" onClick={() => setDecisionStage('closed')}>Cancel</button></div></article>}
    {decisionStage === 'review' && <article className="plan-card record-review" aria-busy={records.saving}><span className="status">Review decision</span><h3>{decision.summary.trim()}</h3><p><strong>Why:</strong> {decision.rationale.trim()}</p><small>This is append-only after saving.</small>{failure && <RecordFailure failure={failure} />}<div className="actions"><button disabled={records.saving} onClick={() => void save(decision, recordId, () => setDecisionStage('saved'))}>{records.saving ? 'Saving decision…' : 'Save decision'}</button><button className="secondary" disabled={records.saving} onClick={() => setDecisionStage('edit')}>Edit</button><button className="secondary" disabled={records.saving} onClick={() => setDecisionStage('edit')}>Cancel review</button></div></article>}
    {decisionStage === 'saved' && <div className="notice success" role="status"><strong>{duplicate ? 'Decision already saved.' : 'Decision saved.'}</strong><p>{duplicate ? 'The original record was restored. No duplicate was added.' : 'It now appears in this Plan’s record.'}</p><button className="secondary compact" onClick={() => setDecisionStage('closed')}>Close</button></div>}

    {bundle && tab === 'history' && <RecordList empty="No completed steps or approved schedule changes have been recorded yet." values={bundle.history.map(entry => ({ id: entry.id, title: entry.title, detail: entry.detail, time: entry.recordedAt, source: entry.sourceId }))} />}
    {bundle && tab === 'decisions' && <RecordList empty="No decisions have been recorded for this Plan yet." values={decisions.map(record => ({ id: record.recordId, title: record.summary, detail: record.rationale, time: record.recordedAt, source: record.recordId }))} />}
    {bundle && tab === 'guidance' && <RecordList empty="No Clara guidance has been saved to this Plan yet." values={savedGuidance.map(record => ({ id: record.recordId, title: record.summary, detail: `${record.rationale} · ${record.confidence} confidence`, time: record.recordedAt, source: record.sourceRecommendationId ?? record.recordId }))} />}
  </section>;
}

function RecordFailure({ failure }: { failure: Exclude<SaveFailure, null> }) {
  const copy = failure === 'offline'
    ? ['You’re offline.', 'Reconnect and retry. Nothing was added.']
    : failure === 'conflict'
      ? ['This save no longer matches its review.', 'Start a new review. The existing record is unchanged.']
      : ['The record could not be confirmed.', 'Retry the same save. Longview will restore the original result if it already succeeded.'];
  return <div className="notice" role="alert"><strong>{copy[0]}</strong><p>{copy[1]}</p></div>;
}

function RecordList({ empty, values }: { empty: string; values: { id: string; title: string; detail: string; time: string; source: string }[] }) {
  if (values.length === 0) return <div className="record-state"><p>{empty}</p></div>;
  return <ol className="record-list">{values.map(value => <li key={value.id}><article className="plan-card"><span className="status">{displayTime(value.time)}</span><h3>{value.title}</h3><p>{value.detail}</p><small>Source record: {value.source}</small></article></li>)}</ol>;
}
