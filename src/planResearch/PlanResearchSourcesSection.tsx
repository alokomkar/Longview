import { useMemo, useRef, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { Plan } from '../plan/types';
import {
  PlanResearchConflictError,
  PlanResearchIdempotencyConflictError,
  normalizeResearchUrl,
  validatePlanResearchSourceDraft,
  validateWikiBriefDraft,
  validateWikiDraft,
  type PlanResearchSourceDraft,
  type PlanResearchSourceGateway,
  type ResearchSourceStateDraft,
  type ResearchWorkflowState,
  type WikiBriefDraft,
  type WikiDraft,
  type WorkspaceResearchSource
} from './types';
import {
  PlanMatchTimeoutError,
  buildPlanMatchRequest,
  parsePlanMatchResponse,
  type PlanMatchGateway,
  type PlanMatchResponse
} from './matching';
import { usePlanResearchSources } from './usePlanResearchSources';

type Tab = 'plan' | 'library' | 'unassigned' | 'wiki';
type CaptureStage = 'closed' | 'capture' | 'matching' | 'association' | 'review' | 'saved';
type Failure = 'offline' | 'conflict' | 'idempotency' | 'timeout' | 'malformed' | 'unavailable' | null;
type OrganizationReview = { source: WorkspaceResearchSource; draft: ResearchSourceStateDraft; reason: string };
const emptyDraft = (): PlanResearchSourceDraft => ({ url: '', title: '', excerpt: '', note: '', topic: '' });
const newId = (prefix: string) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;
const workflowLabel: Record<ResearchWorkflowState, string> = { inbox: 'Inbox', reading: 'Reading', useful: 'Useful', archived: 'Archived' };
const unique = (values: string[]) => [...new Set(values)].sort();

export function PlanResearchSourcesSection({ user, plan, plans, gateway, matchGateway }: {
  user: AuthUser;
  plan: Plan;
  plans: Plan[];
  gateway: PlanResearchSourceGateway;
  matchGateway: PlanMatchGateway;
}) {
  const activePlans = useMemo(() => plans.filter(value => value.status === 'active'), [plans]);
  const workspace = usePlanResearchSources(user, plan.id, activePlans.map(value => value.id), gateway);
  const values = workspace.snapshot.values ?? [];
  const planNames = useMemo(() => new Map(plans.map(value => [value.id, value.title])), [plans]);
  const [tab, setTab] = useState<Tab>('plan');
  const [search, setSearch] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState<ResearchWorkflowState | 'all'>('all');
  const [captureStage, setCaptureStage] = useState<CaptureStage>('closed');
  const [draft, setDraft] = useState<PlanResearchSourceDraft>(emptyDraft);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([plan.id]);
  const [requestId, setRequestId] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof validatePlanResearchSourceDraft>>({});
  const [failure, setFailure] = useState<Failure>(null);
  const [match, setMatch] = useState<PlanMatchResponse | null>(null);
  const [existing, setExisting] = useState<WorkspaceResearchSource | null>(null);
  const matchController = useRef<AbortController | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<OrganizationReview | null>(null);
  const [organizationEditing, setOrganizationEditing] = useState(false);
  const [organizationFailure, setOrganizationFailure] = useState<Failure>(null);
  const [wikiStage, setWikiStage] = useState<'closed' | 'edit' | 'review' | 'saved'>('closed');
  const [wikiDraft, setWikiDraft] = useState<WikiDraft | null>(null);
  const [wikiExpectedVersion, setWikiExpectedVersion] = useState(0);
  const [wikiVersionId, setWikiVersionId] = useState('');
  const [wikiFailure, setWikiFailure] = useState<Failure>(null);
  const [briefStage, setBriefStage] = useState<'closed' | 'edit' | 'review' | 'saved'>('closed');
  const [briefDraft, setBriefDraft] = useState<WikiBriefDraft | null>(null);
  const [briefWikiVersionId, setBriefWikiVersionId] = useState('');
  const [briefVersionId, setBriefVersionId] = useState('');
  const [briefFailure, setBriefFailure] = useState<Failure>(null);

  const currentPlanSources = values.filter(value => value.state.planIds.includes(plan.id));
  const unassigned = values.filter(value => value.state.planIds.length === 0);
  const usefulForPlan = currentPlanSources.filter(value => value.state.workflowState === 'useful');
  const visibleLibrary = values.filter(value => {
    const query = search.trim().toLowerCase();
    return (workflowFilter === 'all' || value.state.workflowState === workflowFilter) && (!query ||
      [value.source.title, value.source.url, value.source.domain, value.source.excerpt, value.state.note, value.state.topic]
        .some(field => field.toLowerCase().includes(query)));
  });
  const wiki = workspace.snapshot.wiki;

  const resetCapture = () => {
    matchController.current?.abort();
    setDraft(emptyDraft()); setSelectedPlanIds([plan.id]); setRequestId(newId('source')); setErrors({}); setFailure(null);
    setMatch(null); setExisting(null); setCaptureStage('capture');
  };
  const validCapture = () => {
    const next = validatePlanResearchSourceDraft(draft);
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const choosePlans = () => {
    if (!validCapture()) return;
    setExisting(values.find(value => value.source.normalizedUrl === normalizeResearchUrl(draft.url)) ?? null);
    setFailure(null); setMatch(null); setCaptureStage('association');
  };
  const askClara = async () => {
    if (!validCapture()) return;
    if (activePlans.length === 0) { setSelectedPlanIds([]); setCaptureStage('association'); return; }
    const request = buildPlanMatchRequest(newId('match'), draft, activePlans);
    const controller = new AbortController();
    matchController.current?.abort(); matchController.current = controller;
    setFailure(null); setMatch(null); setCaptureStage('matching');
    const timer = window.setTimeout(() => controller.abort('timeout'), 15000);
    try {
      const raw = await matchGateway.match(user, request, controller.signal);
      const response = parsePlanMatchResponse(raw, request);
      if (!response) { setFailure('malformed'); setCaptureStage('association'); return; }
      setMatch(response);
      setSelectedPlanIds(response.requiresClarification ? [] : response.candidates.filter(value => value.score >= 60).slice(0, 1).map(value => value.planId));
      setExisting(values.find(value => value.source.normalizedUrl === normalizeResearchUrl(draft.url)) ?? null);
      setCaptureStage('association');
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
      setFailure(error instanceof PlanMatchTimeoutError || controller.signal.reason === 'timeout' ? 'timeout' : navigator.onLine === false ? 'offline' : 'unavailable');
      setCaptureStage('association');
    } finally {
      window.clearTimeout(timer);
    }
  };
  const reviewCapture = () => { setFailure(null); setCaptureStage('review'); };
  const saveCapture = async () => {
    const state: ResearchSourceStateDraft = { note: draft.note, topic: draft.topic, workflowState: existing?.state.workflowState ?? 'inbox', planIds: unique(selectedPlanIds) };
    setFailure(null);
    try {
      if (existing) await workspace.update(existing.source.sourceId, requestId, existing.state.revision, state);
      else await workspace.save(requestId, draft, state);
      setCaptureStage('saved');
    } catch (error) { setFailure(classifyFailure(error)); }
  };
  const togglePlan = (planId: string) => setSelectedPlanIds(current => current.includes(planId) ? current.filter(value => value !== planId) : [...current, planId]);

  const beginOrganization = (source: WorkspaceResearchSource, draftState: ResearchSourceStateDraft, reason: string, edit = false) => {
    setOrganization({ source, draft: draftState, reason }); setOrganizationEditing(edit); setOrganizationFailure(null);
  };
  const saveOrganization = async () => {
    if (!organization) return;
    setOrganizationFailure(null);
    try {
      await workspace.update(organization.source.source.sourceId, newId('organize'), organization.source.state.revision, organization.draft);
      setOrganization(null); setOrganizationEditing(false);
    } catch (error) { setOrganizationFailure(classifyFailure(error)); }
  };

  const startWiki = (pageId?: string) => {
    const existingPage = wiki?.pages.find(value => value.page.pageId === pageId);
    const firstSource = usefulForPlan[0];
    setWikiDraft(existingPage ? {
      pageId: existingPage.page.pageId, title: existingPage.current.title, body: existingPage.current.body,
      citations: existingPage.current.citations.map(value => ({ ...value }))
    } : {
      pageId: newId('wiki-page'), title: '', body: '', citations: firstSource ? [{ sourceId: firstSource.source.sourceId, statement: firstSource.source.excerpt.slice(0, 500) }] : []
    });
    setWikiExpectedVersion(existingPage?.page.currentVersion ?? 0); setWikiVersionId(newId('wiki-version'));
    setWikiFailure(null); setWikiStage('edit'); setBriefStage('closed'); setTab('wiki');
  };
  const saveWiki = async () => {
    if (!wikiDraft) return;
    setWikiFailure(null);
    try { await workspace.saveWiki(wikiVersionId, wikiExpectedVersion, wikiDraft); setWikiStage('saved'); }
    catch (error) { setWikiFailure(classifyFailure(error)); }
  };
  const beginBrief = (version: NonNullable<typeof wiki>['pages'][number]['current']) => {
    setBriefDraft({ focus: version.title, approach: version.body.slice(0, 1000), successEvidence: version.citations.map(value => value.statement).join(' ').slice(0, 600) });
    setBriefWikiVersionId(version.versionId); setBriefVersionId(newId('brief')); setBriefFailure(null); setBriefStage('edit'); setWikiStage('closed');
  };
  const saveBrief = async () => {
    if (!briefDraft || !wiki) return;
    setBriefFailure(null);
    try { await workspace.promoteWiki(briefVersionId, wiki.briefVersion, briefWikiVersionId, briefDraft); setBriefStage('saved'); }
    catch (error) { setBriefFailure(classifyFailure(error)); }
  };

  return <section className="detail-section plan-research-section">
    <div className="record-heading"><div><span className="status">Plan Research Workspace</span><h2>Build understanding before changing the Plan.</h2><p>Collect your own sources, organize what matters, and promote only cited conclusions you review.</p></div><button onClick={resetCapture}>Add a source</button></div>
    <div className="context-grid memory-tabs research-workspace-tabs" role="tablist" aria-label="Plan Research Workspace sections">
      <button role="tab" aria-selected={tab === 'plan'} className={tab === 'plan' ? '' : 'secondary'} onClick={() => setTab('plan')}>This Plan · {currentPlanSources.length}</button>
      <button role="tab" aria-selected={tab === 'library'} className={tab === 'library' ? '' : 'secondary'} onClick={() => setTab('library')}>Library · {values.length}</button>
      <button role="tab" aria-selected={tab === 'unassigned'} className={tab === 'unassigned' ? '' : 'secondary'} onClick={() => setTab('unassigned')}>Unassigned · {unassigned.length}</button>
      <button role="tab" aria-selected={tab === 'wiki'} className={tab === 'wiki' ? '' : 'secondary'} onClick={() => setTab('wiki')}>Plan Wiki · {wiki?.pages.length ?? 0}</button>
    </div>

    {captureStage !== 'closed' && <CaptureFlow stage={captureStage} draft={draft} errors={errors} failure={failure} match={match} existing={existing}
      plans={activePlans} selectedPlanIds={selectedPlanIds} saving={workspace.saving} planNames={planNames}
      onDraft={(field, value) => { setDraft(current => ({ ...current, [field]: value })); setErrors(current => ({ ...current, [field]: undefined })); }}
      onAsk={() => void askClara()} onManual={choosePlans} onTogglePlan={togglePlan} onReview={reviewCapture} onSave={() => void saveCapture()}
      onEdit={() => setCaptureStage('capture')} onCancelMatching={() => { matchController.current?.abort(); setCaptureStage('capture'); }}
      onCancel={() => { matchController.current?.abort(); setCaptureStage('closed'); }} onRestart={resetCapture} />}

    {organization && <OrganizationFlow value={organization} plans={activePlans} planNames={planNames} editing={organizationEditing} saving={workspace.saving}
      failure={organizationFailure} onEdit={() => setOrganizationEditing(true)} onDraft={value => setOrganization(current => current ? { ...current, draft: value } : current)}
      onReview={() => setOrganizationEditing(false)} onSave={() => void saveOrganization()} onCancel={() => { setOrganization(null); setOrganizationEditing(false); }} />}

    {(workspace.snapshot.status === 'loading' && !workspace.snapshot.values) && <Loading label="Loading your research library" />}
    {workspace.snapshot.status === 'error' && <div className="notice" role="alert"><strong>The research workspace couldn’t be refreshed.</strong><p>{values.length ? 'The last confirmed sources remain visible.' : 'No unconfirmed source is shown.'}</p><button onClick={workspace.retry}>Try again</button></div>}

    {tab === 'plan' && <SourceList values={currentPlanSources} empty="No sources are linked to this Plan yet." detailsId={detailsId} planNames={planNames}
      onDetails={setDetailsId} onOrganize={(source, edit) => beginOrganization(source, { ...source.state, planIds: [...source.state.planIds] }, 'Review source organization', edit)}
      onMove={(source, workflowState) => beginOrganization(source, { ...source.state, workflowState, planIds: [...source.state.planIds] }, `Move to ${workflowLabel[workflowState]}`)} />}
    {tab === 'library' && <><LibraryToolbar search={search} filter={workflowFilter} onSearch={setSearch} onFilter={setWorkflowFilter} /><SourceList values={visibleLibrary} empty="No sources match this view." detailsId={detailsId} planNames={planNames}
      onDetails={setDetailsId} onOrganize={(source, edit) => beginOrganization(source, { ...source.state, planIds: [...source.state.planIds] }, 'Review source organization', edit)}
      onMove={(source, workflowState) => beginOrganization(source, { ...source.state, workflowState, planIds: [...source.state.planIds] }, `Move to ${workflowLabel[workflowState]}`)} /></>}
    {tab === 'unassigned' && <SourceList values={unassigned} empty="Nothing is waiting for a Plan." detailsId={detailsId} planNames={planNames}
      onDetails={setDetailsId} onOrganize={(source, edit) => beginOrganization(source, { ...source.state, planIds: [...source.state.planIds] }, 'Choose Plan associations', edit)}
      onMove={(source, workflowState) => beginOrganization(source, { ...source.state, workflowState, planIds: [...source.state.planIds] }, `Move to ${workflowLabel[workflowState]}`)} />}
    {tab === 'wiki' && <WikiPanel wiki={wiki} usefulSources={usefulForPlan} stage={wikiStage} draft={wikiDraft} failure={wikiFailure} saving={workspace.saving}
      briefStage={briefStage} briefDraft={briefDraft} briefFailure={briefFailure} onStart={startWiki} onDraft={setWikiDraft} onReview={() => setWikiStage('review')}
      onBackToEdit={() => setWikiStage('edit')} onSave={() => void saveWiki()} onCancel={() => { setWikiStage('closed'); setBriefStage('closed'); }} onBrief={beginBrief} onBriefDraft={setBriefDraft}
      onBriefReview={() => setBriefStage('review')} onBriefSave={() => void saveBrief()} />}
  </section>;
}

function CaptureFlow({ stage, draft, errors, failure, match, existing, plans, selectedPlanIds, saving, planNames, onDraft, onAsk, onManual, onTogglePlan, onReview, onSave, onEdit, onCancelMatching, onCancel, onRestart }: {
  stage: CaptureStage; draft: PlanResearchSourceDraft; errors: ReturnType<typeof validatePlanResearchSourceDraft>; failure: Failure; match: PlanMatchResponse | null;
  existing: WorkspaceResearchSource | null; plans: Plan[]; selectedPlanIds: string[]; saving: boolean; planNames: Map<string, string>;
  onDraft: (field: keyof PlanResearchSourceDraft, value: string) => void; onAsk: () => void; onManual: () => void; onTogglePlan: (id: string) => void;
  onReview: () => void; onSave: () => void; onEdit: () => void; onCancelMatching: () => void; onCancel: () => void; onRestart: () => void;
}) {
  if (stage === 'capture') return <article className="plan-card record-review"><span className="status">Add a source · nothing saved</span><h3>What should Longview remember?</h3><form onSubmit={event => { event.preventDefault(); onManual(); }} noValidate>
    <SourceFields draft={draft} errors={errors} onDraft={onDraft} /><div className="notice"><strong>Nothing is saved yet.</strong><p>Ask Clara for a read-only suggestion, choose Plans yourself, or keep this source unassigned.</p></div>
    <div className="actions"><button type="button" onClick={onAsk}>Ask Clara to suggest Plans</button><button type="submit" className="secondary">Choose Plans myself</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div>
  </form></article>;
  if (stage === 'matching') return <article className="plan-card" aria-busy="true"><span className="status">Clara matching · read only</span><h3>Comparing this source with active Plans…</h3><p>Nothing is linked or saved while Clara compares the title, excerpt, note, topic, and Plan summaries.</p><div className="clara-progress" role="progressbar" aria-label="Comparing source with Plans"><span /></div><button className="secondary" onClick={onCancelMatching}>Cancel matching</button></article>;
  if (stage === 'association') return <article className="plan-card record-review"><span className="status">Review Plan association · nothing saved</span><h3>{existing ? 'This source already exists.' : match ? 'Review Clara’s suggestion.' : 'Choose where this source belongs.'}</h3>
    {failure && <FailureNotice failure={failure} context="matching" />}{existing && <div className="notice"><strong>{existing.source.title}</strong><p>The existing source will be reused. Its evidence will not be overwritten.</p></div>}
    {match && <div className="clara-box"><strong>{match.summary}</strong>{match.requiresClarification && <p>Clara needs your choice before any association can be saved.</p>}{match.candidates.map(candidate => <div className="match-candidate" key={candidate.planId}><strong>{planNames.get(candidate.planId)} · {candidate.score}%</strong><p>{candidate.rationale}</p><small>{candidate.confidence} confidence</small></div>)}</div>}
    <fieldset><legend>Plan associations</legend>{plans.map(value => <label className="research-plan-choice" key={value.id}><input type="checkbox" checked={selectedPlanIds.includes(value.id)} disabled={!selectedPlanIds.includes(value.id) && selectedPlanIds.length >= 5} onChange={() => onTogglePlan(value.id)} /><span><strong>{value.title}</strong><small>{value.outcome}</small></span></label>)}</fieldset>
    <div className="notice"><strong>{selectedPlanIds.length ? `${selectedPlanIds.length} Plan ${selectedPlanIds.length === 1 ? 'link' : 'links'} selected.` : 'Keep in Unassigned research.'}</strong><p>{selectedPlanIds.length >= 5 ? 'A source can support up to five Plans.' : 'You make the final association.'}</p></div>
    <div className="actions"><button onClick={onReview}>Review source and associations</button><button className="secondary" onClick={onEdit}>Back to source</button><button className="secondary" onClick={onCancel}>Cancel</button></div>
  </article>;
  if (stage === 'review') return <article className="plan-card record-review" aria-busy={saving}><span className="status">Review before saving</span><h3>{existing?.source.title ?? draft.title.trim()}</h3><dl><dt>URL</dt><dd>{existing?.source.url ?? draft.url.trim()}</dd><dt>Excerpt</dt><dd>{existing?.source.excerpt ?? draft.excerpt.trim()}</dd><dt>Topic</dt><dd>{draft.topic.trim()}</dd><dt>Your note</dt><dd>{draft.note.trim()}</dd><dt>Plan links</dt><dd>{selectedPlanIds.length ? selectedPlanIds.map(id => planNames.get(id)).join(', ') : 'Unassigned research'}</dd></dl><small>This saves one source and reviewed organization. It does not change the Plan Wiki or Plan Brief.</small>{failure && <FailureNotice failure={failure} context="save" />}{saving && <Loading label="Saving source and associations" />}<div className="actions"><button disabled={saving || failure === 'conflict' || failure === 'idempotency'} onClick={onSave}>{saving ? 'Saving source…' : existing ? 'Link existing source' : 'Save source'}</button><button className="secondary" disabled={saving} onClick={onEdit}>Edit</button><button className="secondary" disabled={saving} onClick={onCancel}>Cancel</button></div></article>;
  if (stage === 'saved') return <div className="notice success" role="status"><strong>Source saved.</strong><p>It is available in your library and linked only to the Plans you confirmed.</p><button className="compact" onClick={onRestart}>Add another source</button></div>;
  return null;
}

function SourceFields({ draft, errors, onDraft }: { draft: PlanResearchSourceDraft; errors: ReturnType<typeof validatePlanResearchSourceDraft>; onDraft: (field: keyof PlanResearchSourceDraft, value: string) => void }) {
  return <><label>Source URL<input type="url" value={draft.url} onChange={event => onDraft('url', event.target.value)} placeholder="https://example.com/useful-page" /></label>{errors.url && <small role="alert">{errors.url}</small>}<label>Title<input maxLength={200} value={draft.title} onChange={event => onDraft('title', event.target.value)} /></label>{errors.title && <small role="alert">{errors.title}</small>}<label>Useful excerpt<textarea maxLength={2000} value={draft.excerpt} onChange={event => onDraft('excerpt', event.target.value)} /></label>{errors.excerpt && <small role="alert">{errors.excerpt}</small>}<label>Topic or question<input maxLength={120} value={draft.topic} onChange={event => onDraft('topic', event.target.value)} /></label>{errors.topic && <small role="alert">{errors.topic}</small>}<label>Why it matters<textarea maxLength={1000} value={draft.note} onChange={event => onDraft('note', event.target.value)} /></label>{errors.note && <small role="alert">{errors.note}</small>}</>;
}

function OrganizationFlow({ value, plans, planNames, editing, saving, failure, onEdit, onDraft, onReview, onSave, onCancel }: {
  value: OrganizationReview; plans: Plan[]; planNames: Map<string, string>; editing: boolean; saving: boolean; failure: Failure; onEdit: () => void;
  onDraft: (value: ResearchSourceStateDraft) => void; onReview: () => void; onSave: () => void; onCancel: () => void;
}) {
  const updatePlans = (id: string) => onDraft({ ...value.draft, planIds: value.draft.planIds.includes(id) ? value.draft.planIds.filter(item => item !== id) : [...value.draft.planIds, id] });
  if (editing) return <article className="plan-card record-review"><span className="status">Organize source · nothing changed</span><h3>{value.source.source.title}</h3><label>Topic or question<input value={value.draft.topic} maxLength={120} onChange={event => onDraft({ ...value.draft, topic: event.target.value })} /></label><label>Why it matters<textarea value={value.draft.note} maxLength={1000} onChange={event => onDraft({ ...value.draft, note: event.target.value })} /></label><fieldset><legend>Workflow state</legend><div className="actions compact-actions">{(['inbox', 'reading', 'useful', 'archived'] as ResearchWorkflowState[]).map(state => <button type="button" className={value.draft.workflowState === state ? '' : 'secondary'} aria-pressed={value.draft.workflowState === state} key={state} onClick={() => onDraft({ ...value.draft, workflowState: state })}>{workflowLabel[state]}</button>)}</div></fieldset><fieldset><legend>Plan associations</legend>{plans.map(plan => <label className="research-plan-choice" key={plan.id}><input type="checkbox" checked={value.draft.planIds.includes(plan.id)} disabled={!value.draft.planIds.includes(plan.id) && value.draft.planIds.length >= 5} onChange={() => updatePlans(plan.id)} /><span><strong>{plan.title}</strong><small>{plan.outcome}</small></span></label>)}</fieldset>{value.draft.planIds.length >= 5 && <small>A source can support up to five Plans.</small>}<div className="actions"><button disabled={value.draft.note.trim().length < 3 || value.draft.topic.trim().length < 2} onClick={onReview}>Review changes</button><button className="secondary" onClick={onCancel}>Cancel</button></div></article>;
  return <article className="plan-card record-review" aria-busy={saving}><span className="status">{value.reason} · review</span><h3>{value.source.source.title}</h3><dl><dt>Workflow</dt><dd>{workflowLabel[value.draft.workflowState]}</dd><dt>Topic</dt><dd>{value.draft.topic}</dd><dt>Why it matters</dt><dd>{value.draft.note}</dd><dt>Plan links</dt><dd>{value.draft.planIds.length ? value.draft.planIds.map(id => planNames.get(id)).join(', ') : 'Unassigned research'}</dd></dl><small>The source evidence stays immutable. This reviewed change never updates a Wiki or Plan Brief.</small>{failure && <FailureNotice failure={failure} context="organization" />}{saving && <Loading label="Saving source organization" />}<div className="actions"><button disabled={saving || failure === 'conflict' || failure === 'idempotency'} onClick={onSave}>{saving ? 'Saving changes…' : 'Confirm changes'}</button><button className="secondary" disabled={saving} onClick={onEdit}>Edit</button><button className="secondary" disabled={saving} onClick={onCancel}>Cancel</button></div></article>;
}

function LibraryToolbar({ search, filter, onSearch, onFilter }: { search: string; filter: ResearchWorkflowState | 'all'; onSearch: (value: string) => void; onFilter: (value: ResearchWorkflowState | 'all') => void }) {
  return <div className="research-toolbar"><label>Search your research<input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder="Title, URL, note, or topic" /></label><div className="actions compact-actions" aria-label="Filter research workflow">{(['all', 'inbox', 'reading', 'useful', 'archived'] as const).map(value => <button className={filter === value ? '' : 'secondary'} aria-pressed={filter === value} key={value} onClick={() => onFilter(value)}>{value === 'all' ? 'All' : workflowLabel[value]}</button>)}</div></div>;
}

function SourceList({ values, empty, detailsId, planNames, onDetails, onOrganize, onMove }: {
  values: WorkspaceResearchSource[]; empty: string; detailsId: string | null; planNames: Map<string, string>; onDetails: (id: string | null) => void;
  onOrganize: (source: WorkspaceResearchSource, edit: boolean) => void; onMove: (source: WorkspaceResearchSource, state: ResearchWorkflowState) => void;
}) {
  if (values.length === 0) return <div className="record-state"><p>{empty}</p></div>;
  return <div className="research-source-list">{values.map(value => <article className="plan-card research-source-card" key={value.source.sourceId}><span className="status">{workflowLabel[value.state.workflowState]} · saved by you</span><h3>{value.source.title}</h3><p>{value.source.excerpt}</p><div className="research-source-meta"><span>{value.state.topic}</span><span>{value.source.domain}</span><span>{value.state.planIds.length ? `${value.state.planIds.length} Plan ${value.state.planIds.length === 1 ? 'link' : 'links'}` : 'Unassigned'}</span></div><p><strong>Why it matters:</strong> {value.state.note}</p><div className="actions compact-actions"><button onClick={() => onDetails(detailsId === value.source.sourceId ? null : value.source.sourceId)}>{detailsId === value.source.sourceId ? 'Close details' : 'Open details'}</button><button className="secondary" onClick={() => onOrganize(value, true)}>Organize</button>{(['reading', 'useful', 'archived'] as ResearchWorkflowState[]).filter(state => state !== value.state.workflowState).map(state => <button className="secondary" key={state} onClick={() => onMove(value, state)}>Move to {workflowLabel[state]}</button>)}</div>{detailsId === value.source.sourceId && <div className="research-source-details"><dl><dt>Captured</dt><dd>{new Date(value.source.capturedAt).toLocaleString()}</dd><dt>Plan associations</dt><dd>{value.state.planIds.length ? value.state.planIds.map(id => planNames.get(id) ?? 'Unavailable Plan').join(', ') : 'Unassigned research'}</dd><dt>Organization revision</dt><dd>{value.state.revision}</dd></dl><a href={value.source.url} target="_blank" rel="noreferrer">Open original URL</a></div>}</article>)}</div>;
}

function WikiPanel({ wiki, usefulSources, stage, draft, failure, saving, briefStage, briefDraft, briefFailure, onStart, onDraft, onReview, onBackToEdit, onSave, onCancel, onBrief, onBriefDraft, onBriefReview, onBriefSave }: {
  wiki: ReturnType<typeof usePlanResearchSources>['snapshot']['wiki']; usefulSources: WorkspaceResearchSource[]; stage: 'closed' | 'edit' | 'review' | 'saved'; draft: WikiDraft | null;
  failure: Failure; saving: boolean; briefStage: 'closed' | 'edit' | 'review' | 'saved'; briefDraft: WikiBriefDraft | null; briefFailure: Failure;
  onStart: (pageId?: string) => void; onDraft: (value: WikiDraft) => void; onReview: () => void; onBackToEdit: () => void; onSave: () => void; onCancel: () => void;
  onBrief: (version: NonNullable<typeof wiki>['pages'][number]['current']) => void; onBriefDraft: (value: WikiBriefDraft) => void; onBriefReview: () => void; onBriefSave: () => void;
}) {
  if (!wiki) return <Loading label="Loading the Plan Wiki" />;
  const wikiErrors = draft ? validateWikiDraft(draft) : {};
  const briefErrors = briefDraft ? validateWikiBriefDraft(briefDraft) : {};
  if (stage === 'edit' && draft) return <article className="plan-card record-review"><span className="status">Wiki draft · nothing saved</span><h3>Write a cited page</h3><label>Page title<input value={draft.title} maxLength={120} onChange={event => onDraft({ ...draft, title: event.target.value })} /></label>{wikiErrors.title && <small role="alert">{wikiErrors.title}</small>}<label>Your synthesis<textarea value={draft.body} maxLength={5000} onChange={event => onDraft({ ...draft, body: event.target.value })} /></label>{wikiErrors.body && <small role="alert">{wikiErrors.body}</small>}<fieldset><legend>Cited statements from useful sources</legend>{usefulSources.length === 0 && <div className="notice"><strong>No useful source is available.</strong><p>Mark a source Useful and link it to this Plan before citing it.</p></div>}{usefulSources.map(source => { const citation = draft.citations.find(value => value.sourceId === source.source.sourceId); return <div className="wiki-source-choice" key={source.source.sourceId}><label className="research-plan-choice"><input type="checkbox" checked={Boolean(citation)} onChange={() => onDraft({ ...draft, citations: citation ? draft.citations.filter(value => value.sourceId !== source.source.sourceId) : [...draft.citations, { sourceId: source.source.sourceId, statement: source.source.excerpt.slice(0, 500) }] })} /><span><strong>{source.source.title}</strong><small>{source.state.topic}</small></span></label>{citation && <label>Cited statement<textarea value={citation.statement} maxLength={500} onChange={event => onDraft({ ...draft, citations: draft.citations.map(value => value.sourceId === citation.sourceId ? { ...value, statement: event.target.value } : value) })} /></label>}</div>; })}</fieldset>{wikiErrors.citations && <small role="alert">{wikiErrors.citations}</small>}<div className="actions"><button disabled={Object.keys(wikiErrors).length > 0} onClick={onReview}>Review Wiki revision</button><button className="secondary" onClick={onCancel}>Cancel</button></div></article>;
  if (stage === 'review' && draft) return <article className="plan-card record-review" aria-busy={saving}><span className="status">Review immutable Wiki revision</span><h3>{draft.title}</h3><p>{draft.body}</p><dl>{draft.citations.map((citation, index) => <span key={citation.sourceId}><dt>Source [{index + 1}]</dt><dd>{usefulSources.find(value => value.source.sourceId === citation.sourceId)?.source.title}: {citation.statement}</dd></span>)}</dl><small>Saving creates a new Wiki version. The current Plan Brief remains unchanged.</small>{failure && <FailureNotice failure={failure} context="wiki" />}{saving && <Loading label="Saving Wiki revision" />}<div className="actions"><button disabled={saving || failure === 'conflict' || failure === 'idempotency'} onClick={onSave}>{saving ? 'Saving Wiki…' : 'Save Wiki revision'}</button><button className="secondary" disabled={saving} onClick={onBackToEdit}>Edit draft</button><button className="secondary" disabled={saving} onClick={onCancel}>Cancel</button></div></article>;
  if (briefStage === 'edit' && briefDraft) return <article className="plan-card record-review"><span className="status">Plan Brief proposal · nothing saved</span><h3>Promote cited conclusions</h3><label>Focus<input value={briefDraft.focus} maxLength={160} onChange={event => onBriefDraft({ ...briefDraft, focus: event.target.value })} /></label>{briefErrors.focus && <small role="alert">{briefErrors.focus}</small>}<label>Approach<textarea value={briefDraft.approach} maxLength={1000} onChange={event => onBriefDraft({ ...briefDraft, approach: event.target.value })} /></label>{briefErrors.approach && <small role="alert">{briefErrors.approach}</small>}<label>Success evidence<textarea value={briefDraft.successEvidence} maxLength={600} onChange={event => onBriefDraft({ ...briefDraft, successEvidence: event.target.value })} /></label>{briefErrors.successEvidence && <small role="alert">{briefErrors.successEvidence}</small>}<div className="actions"><button disabled={Object.keys(briefErrors).length > 0} onClick={onBriefReview}>Review Plan Brief proposal</button><button className="secondary" onClick={onCancel}>Cancel</button></div></article>;
  if (briefStage === 'review' && briefDraft) return <article className="plan-card record-review" aria-busy={saving}><span className="status">Review Plan Brief version {wiki.briefVersion + 1}</span><h3>{briefDraft.focus}</h3><p><strong>Approach:</strong> {briefDraft.approach}</p><p><strong>Success evidence:</strong> {briefDraft.successEvidence}</p><small>The cited Wiki version remains immutable. This exact proposal becomes the current Plan Brief only after confirmation.</small>{briefFailure && <FailureNotice failure={briefFailure} context="brief" />}{saving && <Loading label="Saving Plan Brief version" />}<div className="actions"><button disabled={saving || briefFailure === 'conflict' || briefFailure === 'idempotency'} onClick={onBriefSave}>{saving ? 'Saving Plan Brief…' : `Save Plan Brief version ${wiki.briefVersion + 1}`}</button><button className="secondary" disabled={saving} onClick={onCancel}>Cancel</button></div></article>;
  return <div className="wiki-pages">{stage === 'saved' && <div className="notice success" role="status"><strong>Wiki revision saved.</strong><p>The Plan Brief is still unchanged.</p></div>}{briefStage === 'saved' && <div className="notice success" role="status"><strong>Plan Brief version saved.</strong><p>The reviewed Wiki conclusion is now part of the current execution brief.</p></div>}<div className="actions"><button disabled={usefulSources.length === 0} onClick={() => onStart()}>Create Wiki page</button></div>{wiki.pages.length === 0 ? <div className="record-state"><p>No cited Wiki page has been saved yet.</p></div> : wiki.pages.map(value => <article className="plan-card wiki-page-card" key={value.page.pageId}><span className="status">Version {value.current.version} · {value.current.citations.length} cited {value.current.citations.length === 1 ? 'source' : 'sources'}</span><h3>{value.current.title}</h3><p>{value.current.body}</p><ol>{value.current.citations.map(citation => <li key={citation.sourceId}>{citation.statement}</li>)}</ol><div className="actions"><button onClick={() => onStart(value.page.pageId)}>Edit cited page</button><button className="secondary" onClick={() => onBrief(value.current)}>Promote to Plan Brief</button></div></article>)}</div>;
}

function Loading({ label }: { label: string }) { return <div className="record-state" aria-busy="true"><div className="clara-progress" role="progressbar" aria-label={label}><span /></div><p>{label}…</p></div>; }
function FailureNotice({ failure, context }: { failure: Exclude<Failure, null>; context: string }) {
  const copy = failure === 'offline' ? ['You’re offline.', 'Reconnect and retry. Your review remains on this screen.']
    : failure === 'timeout' ? ['Clara took too long.', 'Choose Plans manually or retry matching later. Nothing was saved.']
      : failure === 'malformed' ? ['Clara’s suggestion could not be used.', 'Choose Plans manually. Nothing was linked or saved.']
        : failure === 'conflict' ? ['This changed in another session.', 'Your review was not written over newer confirmed work. Reload and review again.']
          : failure === 'idempotency' ? ['This request no longer matches its review.', 'Start a new review. Confirmed work is unchanged.']
            : [context === 'matching' ? 'Plan suggestions are unavailable.' : 'The change could not be saved.', context === 'matching' ? 'Choose Plans manually or retry later.' : 'Retry the same review. Confirmed work is unchanged.'];
  return <div className="notice" role="alert"><strong>{copy[0]}</strong><p>{copy[1]}</p></div>;
}
function classifyFailure(error: unknown): Failure {
  return error instanceof PlanResearchConflictError ? 'conflict' : error instanceof PlanResearchIdempotencyConflictError ? 'idempotency' : navigator.onLine === false ? 'offline' : 'unavailable';
}
