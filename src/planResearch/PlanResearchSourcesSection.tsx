import { useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { Plan } from '../plan/types';
import {
  DuplicateResearchSourceError,
  PlanResearchIdempotencyConflictError,
  validatePlanResearchSourceDraft,
  type PlanResearchSourceDraft,
  type PlanResearchSourceGateway
} from './types';
import { usePlanResearchSources } from './usePlanResearchSources';

type Stage = 'closed' | 'capture' | 'review' | 'saved';
type Failure = 'offline' | 'duplicate' | 'idempotency' | 'unavailable' | null;
const emptyDraft = (): PlanResearchSourceDraft => ({ url: '', title: '', excerpt: '', note: '', topic: '' });
const newId = () => globalThis.crypto?.randomUUID?.() ?? `source-${Date.now()}`;

export function PlanResearchSourcesSection({ user, plan, gateway }: {
  user: AuthUser;
  plan: Plan;
  gateway: PlanResearchSourceGateway;
}) {
  const sources = usePlanResearchSources(user, plan.id, gateway);
  const [stage, setStage] = useState<Stage>('closed');
  const [draft, setDraft] = useState<PlanResearchSourceDraft>(emptyDraft);
  const [requestId, setRequestId] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof validatePlanResearchSourceDraft>>({});
  const [failure, setFailure] = useState<Failure>(null);
  const [duplicate, setDuplicate] = useState(false);

  const start = () => {
    setDraft(emptyDraft()); setRequestId(newId()); setErrors({}); setFailure(null); setDuplicate(false); setStage('capture');
  };
  const review = () => {
    const nextErrors = validatePlanResearchSourceDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) { setFailure(null); setStage('review'); }
  };
  const save = async () => {
    setFailure(null);
    try {
      const result = await sources.save(requestId, draft);
      setDuplicate(result.duplicate);
      setStage('saved');
    } catch (error) {
      setFailure(error instanceof DuplicateResearchSourceError ? 'duplicate'
        : error instanceof PlanResearchIdempotencyConflictError ? 'idempotency'
          : navigator.onLine === false ? 'offline' : 'unavailable');
    }
  };
  const update = (field: keyof PlanResearchSourceDraft, value: string) => {
    setDraft(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
  };

  return <section className="detail-section plan-research-section">
    <div className="record-heading"><div><span className="status">Your research</span><h2>Save useful URLs to this Plan.</h2><p>Add the context you want to remember. Longview does not crawl or rewrite the page.</p></div>{stage === 'closed' && <button onClick={start}>Add a URL</button>}</div>

    {stage === 'capture' && <article className="plan-card record-review"><span className="status">Add a source · nothing saved</span><h3>What should {plan.title} remember?</h3><form onSubmit={event => { event.preventDefault(); review(); }} noValidate>
      <label>Source URL<input type="url" value={draft.url} onChange={event => update('url', event.target.value)} placeholder="https://example.com/useful-page" autoComplete="url" /></label>{errors.url && <small role="alert">{errors.url}</small>}
      <label>Title<input maxLength={200} value={draft.title} onChange={event => update('title', event.target.value)} /></label>{errors.title && <small role="alert">{errors.title}</small>}
      <label>Useful excerpt<textarea maxLength={2000} value={draft.excerpt} onChange={event => update('excerpt', event.target.value)} /></label>{errors.excerpt && <small role="alert">{errors.excerpt}</small>}
      <label>Topic or question<input maxLength={120} value={draft.topic} onChange={event => update('topic', event.target.value)} /></label>{errors.topic && <small role="alert">{errors.topic}</small>}
      <label>Why it matters<textarea maxLength={1000} value={draft.note} onChange={event => update('note', event.target.value)} /></label>{errors.note && <small role="alert">{errors.note}</small>}
      <div className="notice"><strong>Nothing is saved yet.</strong><p>This first slice links the source only to {plan.title}. You can cancel without changing the Plan.</p></div>
      <div className="actions"><button type="submit">Review source</button><button type="button" className="secondary" onClick={() => setStage('closed')}>Cancel</button></div>
    </form></article>}

    {stage === 'review' && <article className="plan-card record-review" aria-busy={sources.saving}><span className="status">Review before saving</span><h3>{draft.title.trim()}</h3><dl><dt>URL</dt><dd>{draft.url.trim()}</dd><dt>Excerpt</dt><dd>{draft.excerpt.trim()}</dd><dt>Topic</dt><dd>{draft.topic.trim()}</dd><dt>Your note</dt><dd>{draft.note.trim()}</dd><dt>Linked Plan</dt><dd>{plan.title}</dd></dl><small>This creates one source and one explicit Plan link. It does not change the Plan Brief.</small>{failure && <SourceSaveFailure failure={failure} onRestart={() => { setRequestId(newId()); setFailure(null); }} />}{sources.saving && <><div className="clara-progress" role="progressbar" aria-label="Saving research source"><span /></div><small>Checking for the same URL and saving one Plan link…</small></>}<div className="actions"><button disabled={sources.saving || failure === 'duplicate' || failure === 'idempotency'} onClick={() => void save()}>{sources.saving ? 'Saving source…' : 'Save source'}</button><button className="secondary" disabled={sources.saving} onClick={() => { setFailure(null); setStage('capture'); }}>Edit</button><button className="secondary" disabled={sources.saving} onClick={() => setStage('closed')}>Cancel</button></div></article>}

    {stage === 'saved' && <div className="notice success" role="status"><strong>{duplicate ? 'This source was already saved once.' : 'Source saved.'}</strong><p>It is linked to {plan.title} and is ready in the Inbox.</p><button className="compact" onClick={start}>Add another URL</button></div>}

    {(sources.snapshot.status === 'loading' && !sources.snapshot.values) && <div className="record-state" aria-busy="true"><div className="clara-progress" role="progressbar" aria-label="Loading saved URLs"><span /></div><p>Loading saved URLs…</p></div>}
    {sources.snapshot.status === 'error' && <div className="notice" role="alert"><strong>Saved URLs couldn’t be refreshed.</strong><p>{sources.snapshot.values?.length ? 'The last confirmed sources remain visible.' : 'No unconfirmed source is shown.'}</p><button onClick={sources.retry}>Try saved URLs again</button></div>}
    {sources.snapshot.values && sources.snapshot.values.length === 0 && stage === 'closed' && <div className="record-state"><p>No URLs are saved to this Plan yet.</p></div>}
    {sources.snapshot.values && sources.snapshot.values.length > 0 && <div className="research-source-list">{sources.snapshot.values.map(({ source, link }) => <article className="plan-card research-source-card" key={source.sourceId}><span className="status">Inbox · saved by you</span><h3>{source.title}</h3><p>{source.excerpt}</p><div className="research-source-meta"><span>{link.topic}</span><span>{source.domain}</span></div><p><strong>Why it matters:</strong> {link.note}</p><a href={source.url} target="_blank" rel="noreferrer">Open original URL</a></article>)}</div>}
  </section>;
}

function SourceSaveFailure({ failure, onRestart }: { failure: Exclude<Failure, null>; onRestart: () => void }) {
  const copy = failure === 'offline' ? ['You’re offline.', 'Reconnect and retry. Your completed review remains here.']
    : failure === 'duplicate' ? ['This URL is already saved to this Plan.', 'Open the existing card instead of creating a second copy.']
      : failure === 'idempotency' ? ['This save no longer matches its review.', 'Start a new save. Confirmed research is unchanged.']
        : ['The source could not be saved.', 'Retry the same save. Longview will restore it if it already succeeded.'];
  return <div className="notice" role="alert"><strong>{copy[0]}</strong><p>{copy[1]}</p>{failure === 'idempotency' && <button className="compact" onClick={onRestart}>Start a new save</button>}</div>;
}
