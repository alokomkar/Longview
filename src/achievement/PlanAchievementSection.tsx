import { useEffect, useMemo, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { Plan } from '../plan/types';
import {
  AchievementConflictError,
  AchievementIdempotencyConflictError,
  ReuseConsentConflictError,
  emptyAchievementDraft,
  normalizeAchievementDraft,
  reflectionFieldIds,
  validateAchievementDraft,
  type AchievementDraft,
  type AchievementGateway,
  type ReflectionFieldId
} from './types';
import { useAchievement } from './useAchievement';

type Stage = 'idle' | 'evidence' | 'reflection' | 'consent' | 'review' | 'cancel' | 'saved' | 'revoke';
type Failure = 'offline' | 'conflict' | 'idempotency' | 'unavailable' | null;

const labels: Record<ReflectionFieldId, string> = {
  whatWorked: 'What worked', whatChanged: 'What changed', doDifferently: 'What to do differently'
};
const newId = (prefix: string) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const newRequestIds = () => ({ achievementId: newId('achievement'), reflectionId: newId('reflection'), consentId: newId('consent') });
const displayTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit'
}).format(new Date(value));

export function PlanAchievementSection({ user, plan, gateway, onPlanCompleted }: {
  user: AuthUser;
  plan: Plan;
  gateway: AchievementGateway;
  onPlanCompleted: (plan: Plan) => void;
}) {
  const achievement = useAchievement(user, plan.id, gateway, true);
  const [stage, setStage] = useState<Stage>('idle');
  const [resumeStage, setResumeStage] = useState<Exclude<Stage, 'cancel'>>('evidence');
  const [draft, setDraft] = useState<AchievementDraft>(emptyAchievementDraft);
  const [ids, setIds] = useState(newRequestIds);
  const [failure, setFailure] = useState<Failure>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [revokeId, setRevokeId] = useState('');
  const [revokeFailure, setRevokeFailure] = useState<Failure>(null);
  const [revokeDuplicate, setRevokeDuplicate] = useState(false);
  const bundle = achievement.snapshot.bundle;
  const normalized = useMemo(() => normalizeAchievementDraft(draft), [draft]);
  const errors = useMemo(() => validateAchievementDraft(draft), [draft]);
  const nonEmptyReflection = reflectionFieldIds.filter(field => normalized.reflection[field]);
  const privateFields = nonEmptyReflection.filter(field => !normalized.approvedReflectionFields.includes(field));

  useEffect(() => {
    setStage('idle');
    setResumeStage('evidence');
    setDraft(emptyAchievementDraft());
    setIds(newRequestIds());
    setFailure(null);
    setDuplicate(false);
    setRevokeId('');
    setRevokeFailure(null);
    setRevokeDuplicate(false);
  }, [plan.id]);

  const start = () => {
    setDraft(emptyAchievementDraft());
    setIds(newRequestIds());
    setFailure(null);
    setDuplicate(false);
    setStage('evidence');
  };
  const discard = () => {
    setDraft(emptyAchievementDraft());
    setIds(newRequestIds());
    setFailure(null);
    setStage('idle');
  };
  const pause = (currentStage: Exclude<Stage, 'cancel'>) => {
    setResumeStage(currentStage);
    setStage('cancel');
  };
  const save = async () => {
    if (!bundle || Object.keys(errors).length > 0) return;
    setFailure(null);
    if (navigator.onLine === false) { setFailure('offline'); return; }
    try {
      const result = await achievement.finish({
        ...ids,
        expectedPlanRevision: plan.scheduleVersion ?? 0,
        completedStepIds: bundle.completedStepIds,
        draft: normalized
      });
      setDuplicate(result.duplicate);
      setStage('saved');
      onPlanCompleted(result.plan);
    } catch (error) {
      setFailure(error instanceof AchievementConflictError
        ? 'conflict' : error instanceof AchievementIdempotencyConflictError
          ? 'idempotency' : navigator.onLine === false ? 'offline' : 'unavailable');
    }
  };
  const beginRevoke = () => {
    setRevokeId(newId('consent'));
    setRevokeFailure(null);
    setRevokeDuplicate(false);
    setStage('revoke');
  };
  const revoke = async () => {
    if (!bundle?.consent) return;
    setRevokeFailure(null);
    try {
      const result = await achievement.revoke({ consentId: revokeId, expectedConsentVersion: bundle.consentVersion });
      setRevokeDuplicate(result.duplicate);
      setStage('saved');
    } catch (error) {
      setRevokeFailure(error instanceof ReuseConsentConflictError
        ? 'conflict' : error instanceof AchievementIdempotencyConflictError
          ? 'idempotency' : navigator.onLine === false ? 'offline' : 'unavailable');
    }
  };

  if ((achievement.snapshot.status === 'idle' || achievement.snapshot.status === 'loading') && !bundle) {
    return <section className="detail-section achievement-section"><div className="record-state" aria-busy="true"><div className="clara-progress" role="progressbar" aria-label="Loading Plan achievement"><span /></div><p>Checking completed steps and achievement history…</p></div></section>;
  }
  if (achievement.snapshot.status === 'error' && !bundle) {
    return <section className="detail-section achievement-section"><div className="notice" role="alert"><strong>Achievement details couldn’t be verified.</strong><p>No unverified completion evidence or reuse permission is shown.</p><button onClick={achievement.retry}>Try achievement again</button></div></section>;
  }
  if (!bundle) return null;

  if (bundle.achievement && bundle.consent) {
    const reflection = bundle.reflection;
    const reusable = bundle.consent.approvedReflectionFields;
    return <section className="detail-section achievement-section">
      <div className="record-heading"><div><span className="status">Plan achieved</span><h2>Your completed journey.</h2><p>Evidence and reuse permission remain separately reviewable.</p></div></div>
      {(stage === 'saved' || duplicate || revokeDuplicate) && <div className="notice success" role="status"><strong>{revokeDuplicate ? 'Reuse permission was already updated once.' : duplicate ? 'Achievement already saved once.' : 'Confirmed work restored.'}</strong><p>{revokeDuplicate || duplicate ? 'The original matching result was returned; nothing was duplicated.' : 'The authoritative achievement is shown below.'}</p></div>}
      {achievement.snapshot.status === 'error' && <div className="notice" role="alert"><strong>The achievement couldn’t be refreshed.</strong><p>The last validated record remains visible.</p><button onClick={achievement.retry}>Try refresh again</button></div>}
      <article className="plan-card achievement-proof"><span className="status">Evidence confirmed · {displayTime(bundle.achievement.recordedAt)}</span><h3>{bundle.achievement.outcome}</h3><ul>{bundle.achievement.evidence.map((item, index) => <li key={`${item.label}-${index}`}>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.label}</a> : item.label}</li>)}</ul><small>{bundle.achievement.completedStepIds.length} completion {bundle.achievement.completedStepIds.length === 1 ? 'record' : 'records'} · {bundle.achievement.achievementId}</small></article>
      {reflection && <article className="plan-card achievement-reflection"><span className="status">Private reflection</span>{reflectionFieldIds.filter(field => reflection[field]).map(field => <div key={field}><strong>{labels[field]}</strong><p>{reflection[field]}</p></div>)}</article>}
      <article className="plan-card achievement-consent"><span className="status">Future Clara reuse · consent revision {bundle.consent.version}</span>{reusable.length ? <>{reusable.map(field => <div key={field}><strong>{labels[field]}</strong><p>{reflection?.[field]}</p></div>)}<small>Purpose: future Plan guidance only.</small><button className="danger" onClick={beginRevoke}>Stop future reuse</button></> : <><h3>Reuse is off.</h3><p>No reflection statement is approved for future Clara context.</p></>}</article>
      {stage === 'revoke' && <article className="plan-card record-review" aria-busy={achievement.revoking}><span className="status">Review reuse revocation</span><h3>Stop future reuse?</h3><p>The achievement and private reflection stay in this Plan.</p><small>This affects future requests only. It does not claim to remove guidance already generated.</small>{revokeFailure && <AchievementFailure failure={revokeFailure} kind="revocation" />}{revokeFailure === 'conflict' && <button className="secondary" onClick={() => { achievement.retry(); setStage('saved'); setRevokeFailure(null); }}>Review latest permission</button>}{revokeFailure === 'idempotency' && <button className="secondary" onClick={() => { setRevokeId(newId('consent')); setRevokeFailure(null); }}>Start a new revocation</button>}<div className="actions"><button className="danger" disabled={achievement.revoking || revokeFailure === 'conflict' || revokeFailure === 'idempotency'} onClick={() => void revoke()}>{achievement.revoking ? 'Updating reuse permission…' : 'Confirm stop future reuse'}</button><button className="secondary" disabled={achievement.revoking} onClick={() => setStage('saved')}>Keep current permission</button></div>{achievement.revoking && <div className="clara-progress" role="progressbar" aria-label="Updating reuse permission"><span /></div>}</article>}
    </section>;
  }

  return <section className="detail-section achievement-section">
    <div className="record-heading"><div><span className="status">Plan achievement</span><h2>Finish with proof you can trust.</h2><p>Reflection stays private unless you approve exact statements for future guidance.</p></div></div>
    {achievement.snapshot.status === 'error' && <div className="notice" role="alert"><strong>Completed steps couldn’t be refreshed.</strong><p>The last validated eligibility remains visible.</p><button onClick={achievement.retry}>Check again</button></div>}
    {!bundle.eligible && stage === 'idle' && <div className="record-state"><h3>This Plan is not ready to finish.</h3><p>Complete the required current step first. Optional work will not block finishing.</p><button onClick={achievement.retry}>Check completed steps again</button></div>}
    {bundle.eligible && stage === 'idle' && <article className="plan-card achievement-ready"><span className="status">All required steps complete</span><h3>Ready to record the outcome.</h3><p>{bundle.completedStepIds.length} confirmed completion {bundle.completedStepIds.length === 1 ? 'record is' : 'records are'} attached to this Plan.</p><button onClick={start}>Finish Plan</button></article>}
    {stage === 'evidence' && <EvidenceEditor draft={draft} errors={errors} onDraft={setDraft} onContinue={() => { if (!errors.outcome && !errors.evidence) setStage('reflection'); }} onCancel={() => pause('evidence')} />}
    {stage === 'reflection' && <ReflectionEditor draft={draft} onDraft={setDraft} onContinue={() => setStage('consent')} onSkip={() => { setDraft(current => ({ ...current, reflection: { whatWorked: '', whatChanged: '', doDifferently: '' }, approvedReflectionFields: [] })); setStage('consent'); }} onCancel={() => pause('reflection')} />}
    {stage === 'consent' && <ConsentEditor draft={draft} onDraft={setDraft} onContinue={() => setStage('review')} onBack={() => setStage('reflection')} onCancel={() => pause('consent')} />}
    {stage === 'review' && <article className="plan-card record-review" aria-busy={achievement.saving}><span className="status">Review before finishing</span><h3>{normalized.outcome}</h3><p><strong>Completion evidence</strong></p><ul>{normalized.evidence.map((item, index) => <li key={`${item.label}-${index}`}>{item.label}{item.url ? ' · secure link attached' : ''}</li>)}</ul><div className="achievement-review-grid"><div><strong>Private reflection</strong><span>{privateFields.length} statements</span></div><div><strong>Clara may reuse</strong><span>{normalized.approvedReflectionFields.length} statements</span></div></div>{normalized.approvedReflectionFields.length ? normalized.approvedReflectionFields.map(field => <div className="approved-memory" key={field}><strong>{labels[field]}</strong><p>{normalized.reflection[field]}</p></div>) : <div className="notice"><strong>Reuse nothing.</strong><p>No reflection will be added to future Clara context.</p></div>}<small>Nothing has been saved. The Plan remains active until this exact review is confirmed.</small>{failure && <AchievementFailure failure={failure} kind="finish" />}{failure === 'conflict' && <button className="secondary" onClick={() => { achievement.retry(); setStage('idle'); setFailure(null); }}>Reload latest Plan</button>}{failure === 'idempotency' && <button className="secondary" onClick={() => { setIds(newRequestIds()); setFailure(null); }}>Start a new save</button>}<div className="actions"><button disabled={achievement.saving || failure === 'conflict' || failure === 'idempotency'} onClick={() => void save()}>{achievement.saving ? 'Finishing this Plan…' : 'Finish and save'}</button><button className="secondary" disabled={achievement.saving} onClick={() => setStage('consent')}>Change reuse choices</button><button className="secondary" disabled={achievement.saving} onClick={() => pause('review')}>Cancel finishing</button></div>{achievement.saving && <div className="clara-progress" role="progressbar" aria-label="Finishing this Plan"><span /></div>}</article>}
    {stage === 'cancel' && <article className="plan-card record-review"><span className="status">Finishing paused</span><h3>Your draft is still here.</h3><p>The Plan remains active. Continue where you stopped or discard the unsaved draft.</p><div className="actions"><button onClick={() => setStage(resumeStage)}>Continue finishing</button><button className="secondary" onClick={discard}>Discard draft</button></div></article>}
  </section>;
}

function EvidenceEditor({ draft, errors, onDraft, onContinue, onCancel }: {
  draft: AchievementDraft;
  errors: ReturnType<typeof validateAchievementDraft>;
  onDraft: (draft: AchievementDraft) => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const updateEvidence = (index: number, field: 'label' | 'url', value: string) => onDraft({
    ...draft,
    evidence: draft.evidence.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: field === 'url' ? value || null : value } : item)
  });
  return <article className="plan-card record-review"><span className="status">Completion evidence</span><h3>Record what you achieved.</h3><label>Measurable outcome<textarea maxLength={600} value={draft.outcome} onChange={event => onDraft({ ...draft, outcome: event.target.value })} /></label>{errors.outcome && <small role="alert">{errors.outcome}</small>}{draft.evidence.map((item, index) => <fieldset key={index}><legend>Evidence {index + 1}{index === 0 ? ' · required' : ' · optional'}</legend><label>Evidence label<input maxLength={160} value={item.label} onChange={event => updateEvidence(index, 'label', event.target.value)} /></label><label>Secure link · optional<input inputMode="url" maxLength={1000} value={item.url ?? ''} onChange={event => updateEvidence(index, 'url', event.target.value)} /></label>{index > 0 && <button className="secondary compact" onClick={() => onDraft({ ...draft, evidence: draft.evidence.filter((_, itemIndex) => itemIndex !== index) })}>Remove evidence</button>}</fieldset>)}{errors.evidence && <small role="alert">{errors.evidence}</small>}{draft.evidence.length < 3 && <button className="secondary" onClick={() => onDraft({ ...draft, evidence: [...draft.evidence, { label: '', url: null }] })}>Add another evidence reference</button>}<div className="actions"><button disabled={Boolean(errors.outcome || errors.evidence)} onClick={onContinue}>Continue to reflection</button><button className="secondary" onClick={onCancel}>Cancel finishing</button></div></article>;
}

function ReflectionEditor({ draft, onDraft, onContinue, onSkip, onCancel }: {
  draft: AchievementDraft;
  onDraft: (draft: AchievementDraft) => void;
  onContinue: () => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  return <article className="plan-card record-review"><span className="status">Private reflection · optional</span><h3>What will help next time?</h3>{reflectionFieldIds.map(field => <label key={field}>{labels[field]}<textarea maxLength={1000} value={draft.reflection[field]} onChange={event => onDraft({ ...draft, reflection: { ...draft.reflection, [field]: event.target.value }, approvedReflectionFields: draft.approvedReflectionFields.filter(value => value !== field) })} /></label>)}<small>Your words remain private unless you select exact statements on the next screen.</small><div className="actions"><button onClick={onContinue}>Choose what Clara may reuse</button><button className="secondary" onClick={onSkip}>Skip reflection</button><button className="secondary" onClick={onCancel}>Cancel finishing</button></div></article>;
}

function ConsentEditor({ draft, onDraft, onContinue, onBack, onCancel }: {
  draft: AchievementDraft;
  onDraft: (draft: AchievementDraft) => void;
  onContinue: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const normalized = normalizeAchievementDraft(draft);
  const available = reflectionFieldIds.filter(field => normalized.reflection[field]);
  const toggle = (field: ReflectionFieldId) => onDraft({
    ...draft,
    approvedReflectionFields: draft.approvedReflectionFields.includes(field)
      ? draft.approvedReflectionFields.filter(value => value !== field)
      : reflectionFieldIds.filter(value => [...draft.approvedReflectionFields, field].includes(value))
  });
  return <article className="plan-card record-review"><span className="status">Reuse permission · private by default</span><h3>Choose exactly what Clara may reuse.</h3><p>Permission applies only to future Plan guidance.</p>{available.length ? <div className="consent-options">{available.map(field => <label className="consent-option" key={field}><span><strong>{labels[field]}</strong><small>{normalized.reflection[field]}</small></span><input type="checkbox" checked={draft.approvedReflectionFields.includes(field)} onChange={() => toggle(field)} aria-label={`Allow Clara to reuse ${labels[field]}`} /></label>)}</div> : <div className="notice"><strong>There is no reflection to reuse.</strong><p>Your completion evidence remains part of this Plan.</p></div>}<button className="secondary" onClick={() => onDraft({ ...draft, approvedReflectionFields: [] })}>Reuse nothing</button><div className="notice"><strong>{normalized.approvedReflectionFields.length ? `${normalized.approvedReflectionFields.length} exact ${normalized.approvedReflectionFields.length === 1 ? 'statement' : 'statements'} selected.` : 'Reuse is off.'}</strong><p>You will review private and reusable content again before saving.</p></div><div className="actions"><button onClick={onContinue}>Review finish</button><button className="secondary" onClick={onBack}>Edit reflection</button><button className="secondary" onClick={onCancel}>Cancel finishing</button></div></article>;
}

function AchievementFailure({ failure, kind }: { failure: Exclude<Failure, null>; kind: 'finish' | 'revocation' }) {
  const copy = failure === 'offline'
    ? ['You’re offline.', kind === 'finish' ? 'Your exact draft remains here. The Plan is still active.' : 'Current reuse permission remains in place.']
    : failure === 'conflict'
      ? [kind === 'finish' ? 'This Plan changed in another tab.' : 'Reuse permission changed in another tab.', 'Nothing here replaced the latest confirmed state.']
      : failure === 'idempotency'
        ? ['This request no longer matches its review.', 'Start a new save. Confirmed work is unchanged.']
        : [kind === 'finish' ? 'The achievement could not be confirmed.' : 'Reuse permission was not changed.', kind === 'finish' ? 'Retry the same save. Longview will restore it if it already succeeded.' : 'Retry the same revocation after checking your connection.'];
  return <div className="notice" role="alert"><strong>{copy[0]}</strong><p>{copy[1]}</p></div>;
}
