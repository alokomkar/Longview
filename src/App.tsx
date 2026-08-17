import { firebaseAuthGateway } from './auth/firebaseGateway';
import { useAuth } from './auth/useAuth';
import type { AuthFailure, AuthGateway } from './auth/types';
import { lazyFirebaseWorkspaceGateway } from './workspace/lazyWorkspaceGateway';
import type { WorkspaceGateway } from './workspace/types';
import { useWorkspace } from './workspace/useWorkspace';
import { lazyFirebasePlanGateway } from './plan/lazyPlanGateway';
import {
  PlanScheduleConflictError,
  orderWorkingDays,
  validatePlanDraft,
  validatePlanSchedule,
  workingDays,
  type Plan,
  type PlanDraft,
  type PlanErrors,
  type PlanGateway,
  type PlanScheduleDraft,
  type PlanScheduleErrors,
  type WorkingDay
} from './plan/types';
import { usePlans } from './plan/usePlans';
import { usePlanDetails } from './plan/usePlanDetails';
import { derivePortfolio } from './plan/portfolio';
import { deriveTodayStep, findNextScheduledDate, type TodayStep } from './today/deriveTodayStep';
import { lazyFirebaseTodayGateway } from './today/lazyTodayGateway';
import type { TodayGateway } from './today/types';
import { useTodayCompletion } from './today/useTodayCompletion';
import { buildClaraContext, type ClaraGateway } from './clara/types';
import { previewClaraGateway } from './clara/previewGateway';
import { useClaraRecommendation, type ClaraFailure } from './clara/useClaraRecommendation';
import { formatLongDate } from './date/formatLongDate';
import { useEffect, useMemo, useState } from 'react';
import './styles.css';

const failureCopy: Record<AuthFailure, string> = {
  cancelled: 'Sign-in was cancelled. Nothing changed—try again or continue anonymously.',
  'popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for Longview and retry.',
  'account-conflict': 'That Google account already has a Longview workspace. Your anonymous workspace was not changed.',
  offline: 'You appear to be offline. Reconnect and try again; local access remains unchanged.',
  unknown: 'Sign-in could not be completed. Nothing was changed.'
};

const localDate = () => {
  const date = new Date();
  const part = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
};
const requestId = () => globalThis.crypto?.randomUUID?.() ?? `plan-${Date.now()}`;
const dayLabels: Record<WorkingDay, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun'
};
const defaultWorkingDays: WorkingDay[] = ['mon', 'wed', 'fri'];
const createEmptyPlanDraft = (): PlanDraft => ({
  clientRequestId: requestId(), title: '', outcome: '', why: '', targetDate: localDate(), weeklyHours: 5,
  workingDays: [...defaultWorkingDays]
});
const claraFailureCopy: Record<ClaraFailure, [string, string]> = {
  offline: ['You’re offline.', 'Reconnect and try again. Your step and Plan are unchanged.'],
  timeout: ['Clara took too long.', 'The request stopped safely. Your step and Plan are unchanged.'],
  malformed: ['Clara’s response could not be used.', 'It did not match the expected format, so nothing was applied.'],
  unavailable: ['Clara is unavailable.', 'Try again shortly. Your step and Plan are unchanged.']
};

function TodayStepCard({ step, completed = false }: { step: TodayStep; completed?: boolean }) {
  return <article className={`plan-card today-card${completed ? ' success' : ''}`}><span className="status">{completed ? `Completed · ${step.planTitle}` : `From ${step.planTitle}`}</span><h2>{step.title}</h2>{!completed && <p>{step.description}</p>}<dl><dt>Time</dt><dd>{step.durationMinutes} minutes</dd><dt>{completed ? 'Completed' : 'Plan target'}</dt><dd>{formatLongDate(completed ? step.date : step.targetDate)}</dd></dl><small>{completed ? 'Your Plan stays active. No new schedule was created.' : 'Prepared from your saved Plan. Nothing was changed.'}</small></article>;
}

function ClaraPanel({ clara, onClose }: {
  clara: ReturnType<typeof useClaraRecommendation>;
  onClose: () => void;
}) {
  const { snapshot } = clara;
  if (snapshot.status === 'loading') return <aside className="plan-card clara-card" aria-busy="true"><span className="status">Clara · read only</span><h2>Reviewing this step…</h2><p>Using only the selected Plan and Today step.</p><button className="secondary" onClick={onClose}>Cancel</button></aside>;
  if (snapshot.status === 'error') {
    const [title, detail] = claraFailureCopy[snapshot.failure];
    return <aside className="plan-card clara-card" role="alert"><span className="status">Nothing changed</span><h2>{title}</h2><p>{detail}</p><div className="actions"><button onClick={clara.retry}>Try again</button><button className="secondary" onClick={onClose}>Close</button></div></aside>;
  }
  if (snapshot.status === 'ready') return <aside className="plan-card clara-card"><span className="status">Read-only recommendation · {snapshot.recommendation.confidence} confidence</span><h2>{snapshot.recommendation.headline}</h2><p>{snapshot.recommendation.recommendation}</p><p><strong>Why:</strong> {snapshot.recommendation.rationale}</p><dl>{snapshot.recommendation.sourceFacts.map(fact => <div key={fact}><dt>Context used</dt><dd>{fact}</dd></div>)}</dl><small>Preview adapter · Nothing was changed.</small><button className="secondary" onClick={onClose}>Close recommendation</button></aside>;
  return null;
}

function WorkspaceReady({ auth, gateway, planGateway, todayGateway, claraGateway }: {
  auth: ReturnType<typeof useAuth>;
  gateway: WorkspaceGateway;
  planGateway: PlanGateway;
  todayGateway: TodayGateway;
  claraGateway: ClaraGateway;
}) {
  const snapshot = auth.snapshot;
  if (snapshot.status !== 'authenticated') return null;
  const workspace = useWorkspace(snapshot.user, gateway);
  const [stage, setStage] = useState<'workspace' | 'today' | 'plan-create' | 'plan-review' | 'plan-saved' | 'plan-details' | 'plan-schedule'>(() =>
    localStorage.getItem('longview:onboarding') === 'complete' ? 'today' : 'workspace'
  );
  const [view, setView] = useState<'today' | 'plans' | 'settings'>('today');
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [showClara, setShowClara] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [detailsContext, setDetailsContext] = useState<'history' | 'decisions' | 'research' | 'brief' | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<PlanScheduleDraft>({ workingDays: defaultWorkingDays, weeklyHours: 5 });
  const [scheduleErrors, setScheduleErrors] = useState<PlanScheduleErrors>({});
  const [scheduleFailure, setScheduleFailure] = useState<'conflict' | 'unavailable' | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [planDraft, setPlanDraft] = useState<PlanDraft>(createEmptyPlanDraft);
  const [planErrors, setPlanErrors] = useState<PlanErrors>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSaveFailed, setPlanSaveFailed] = useState(false);
  const plans = usePlans(snapshot.user, planGateway, (stage === 'today' && view !== 'settings') || stage === 'plan-details' || stage === 'plan-schedule');
  const planDetails = usePlanDetails(snapshot.user, planGateway, selectedPlanId, stage === 'plan-details' || stage === 'plan-schedule');
  const todayStep = useMemo(() => deriveTodayStep(plans.snapshot.plans, localDate()), [plans.snapshot.plans]);
  const nextScheduledDate = useMemo(() => findNextScheduledDate(plans.snapshot.plans, localDate()), [plans.snapshot.plans]);
  const selectedDetailsPlan = planDetails.snapshot.status === 'ready' ? planDetails.snapshot.plan : null;
  const selectedDetailsStep = useMemo(() => selectedDetailsPlan ? deriveTodayStep([selectedDetailsPlan], localDate()) : null, [selectedDetailsPlan]);
  const selectedDetailsNextDate = useMemo(() => selectedDetailsPlan ? findNextScheduledDate([selectedDetailsPlan], localDate()) : null, [selectedDetailsPlan]);
  const portfolio = useMemo(() => derivePortfolio(plans.snapshot.plans), [plans.snapshot.plans]);
  const selectedPlan = useMemo(() => plans.snapshot.plans.find(plan => plan.id === todayStep?.planId) ?? null, [plans.snapshot.plans, todayStep?.planId]);
  const completion = useTodayCompletion(snapshot.user, todayStep, todayGateway, stage === 'today' && view === 'today' && plans.snapshot.status === 'ready');
  const clara = useClaraRecommendation(claraGateway);

  useEffect(() => {
    setShowClara(false);
    clara.cancel();
  }, [clara.cancel, todayStep?.completionId, view]);

  const askClara = () => {
    if (!selectedPlan || !todayStep) return;
    setShowClara(true);
    void clara.ask(buildClaraContext(selectedPlan, todayStep, requestId()));
  };

  const updatePlan = (field: keyof PlanDraft, value: string | number) => {
    setPlanDraft(current => ({ ...current, [field]: value }));
    setPlanErrors(current => ({ ...current, [field]: undefined }));
  };

  const startNewPlan = () => {
    setPlanDraft(createEmptyPlanDraft());
    setPlanErrors({});
    setPlanSaveFailed(false);
    setStage('plan-create');
  };

  const reviewPlan = () => {
    const errors = validatePlanDraft(planDraft, localDate());
    setPlanErrors(errors);
    if (Object.keys(errors).length === 0) setStage('plan-review');
  };

  const savePlan = async () => {
    if (savingPlan) return;
    setSavingPlan(true);
    setPlanSaveFailed(false);
    try {
      await planGateway.create(snapshot.user, planDraft);
      setStage('plan-saved');
    } catch {
      setPlanSaveFailed(true);
    } finally {
      setSavingPlan(false);
    }
  };

  const continueSetup = () => {
    localStorage.setItem('longview:onboarding', 'complete');
    setStage('today');
  };

  const openPlanDetails = (plan: Plan) => {
    setSelectedPlanId(plan.id);
    setDetailsContext(null);
    setStage('plan-details');
  };

  const openPlanSchedule = (plan: Plan) => {
    setSelectedPlanId(plan.id);
    setScheduleDraft({
      workingDays: plan.workingDays ? [...plan.workingDays] : [...defaultWorkingDays],
      weeklyHours: plan.weeklyHours
    });
    setScheduleErrors({});
    setScheduleFailure(null);
    setStage('plan-schedule');
  };

  const savePlanSchedule = async () => {
    if (!selectedDetailsPlan || savingSchedule) return;
    const errors = validatePlanSchedule(scheduleDraft);
    setScheduleErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSavingSchedule(true);
    setScheduleFailure(null);
    try {
      const updated = await planGateway.updateSchedule(
        snapshot.user,
        selectedDetailsPlan.id,
        scheduleDraft,
        selectedDetailsPlan.scheduleVersion ?? 0
      );
      plans.replace(updated);
      planDetails.replace(updated);
      setStage('plan-details');
    } catch (error) {
      setScheduleFailure(error instanceof PlanScheduleConflictError ? 'conflict' : 'unavailable');
    } finally {
      setSavingSchedule(false);
    }
  };

  const clearLocalData = async () => {
    localStorage.clear();
    if ('serviceWorker' in navigator) {
      await Promise.all((await navigator.serviceWorker.getRegistrations()).map(registration => registration.unregister()));
    }
    if ('caches' in window) {
      await Promise.all((await caches.keys()).map(name => caches.delete(name)));
    }
    await auth.signOut();
  };

  if (workspace.snapshot.status === 'loading') {
    return <main className="shell" aria-busy="true"><p className="eyebrow">Longview</p><h1>Preparing your workspace…</h1></main>;
  }

  if (workspace.snapshot.status === 'error') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Workspace unavailable</span><h1>Your account is safe.</h1><p>Longview could not prepare the workspace. Check the local emulator and retry.</p><button onClick={workspace.retry}>Retry workspace setup</button></section></main>;
  }

  if (stage === 'plan-details') {
    const detailSnapshot = planDetails.snapshot;
    if (detailSnapshot.status !== 'ready') {
      if (detailSnapshot.status === 'idle' || detailSnapshot.status === 'loading') return <main className="shell" aria-busy="true"><p className="eyebrow">Longview</p><section className="card"><span className="status">Plan details</span><h1>Loading this Plan…</h1><p>Reading the latest owner-approved version.</p></section></main>;
      if (detailSnapshot.status === 'missing') return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Plan unavailable</span><h1>This Plan is no longer available.</h1><p>No old details are shown. Return to Plans to load the latest portfolio.</p><button onClick={() => { setStage('today'); setView('plans'); plans.retry(); }}>Return to Plans</button></section></main>;
      return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Plan details unavailable</span><h1>Couldn’t load this Plan.</h1><p>The saved Plan is unchanged. Check your connection and retry the same Plan.</p><div className="actions"><button onClick={planDetails.retry}>Try again</button><button className="secondary" onClick={() => { setStage('today'); setView('plans'); }}>Return to Plans</button></div></section></main>;
    }
    const plan = detailSnapshot.plan;
    const mode = portfolio.entries.find(entry => entry.plan.id === plan.id)?.mode ?? 'Focus';
    const contextCopy = detailsContext ? {
      history: ['Execution history', 'No completed work has been recorded for this Plan yet.'],
      decisions: ['Decisions', 'No decisions have been recorded for this Plan yet.'],
      research: ['Research', 'No reviewed research has been saved for this Plan yet.'],
      brief: ['Plan brief', 'No Plan brief has been created yet.']
    }[detailsContext] : null;
    return <main className="app-shell plan-details-shell"><header><p className="eyebrow">Longview</p><button className="secondary compact" onClick={() => { setStage('today'); setView('plans'); }}>Back to Plans</button></header><section className="plan-details-view"><span className="status">Plan details · {mode}</span><h1>{plan.title}</h1><p className="lead">{plan.outcome}</p><div className="detail-grid"><article className="plan-card"><h2>Plan overview</h2><dl><dt>Why it matters</dt><dd>{plan.why}</dd><dt>Target date</dt><dd>{formatLongDate(plan.targetDate)}</dd><dt>Weekly time</dt><dd>{plan.weeklyHours} hours</dd><dt>Working days</dt><dd>{plan.workingDays ? orderWorkingDays(plan.workingDays).map(day => dayLabels[day]).join(', ') : 'Schedule not set'}</dd></dl><button onClick={() => openPlanSchedule(plan)}>{plan.workingDays ? 'Edit schedule' : 'Add schedule'}</button></article><article className="plan-card"><span className="status">Current step</span>{selectedDetailsStep ? <><h2>{selectedDetailsStep.title}</h2><p>{selectedDetailsStep.description}</p><small>{selectedDetailsStep.durationMinutes} minutes · scheduled today</small><button onClick={() => { setStage('today'); setView('today'); }}>Open Today</button></> : <><h2>Nothing scheduled today.</h2><p>{plan.workingDays ? selectedDetailsNextDate ? `This Plan returns ${formatLongDate(selectedDetailsNextDate)}.` : 'No upcoming working day is available.' : 'Add working days in Plan overview before this Plan can appear in Today.'}</p></>}</article></div><section className="detail-section"><div><span className="status">Plan context</span><h2>Keep the reasoning with the work.</h2><p>These sections stay scoped to this Plan. Empty sections do not invent activity.</p></div><div className="context-grid"><button className="secondary" onClick={() => setDetailsContext('history')}>Execution history</button><button className="secondary" onClick={() => setDetailsContext('decisions')}>Decisions</button><button className="secondary" onClick={() => setDetailsContext('research')}>Research</button><button className="secondary" onClick={() => setDetailsContext('brief')}>Plan brief</button></div>{contextCopy && <div className="notice"><strong>{contextCopy[0]}</strong><p>{contextCopy[1]}</p><button className="secondary compact" onClick={() => setDetailsContext(null)}>Close</button></div>}</section></section></main>;
  }

  if (stage === 'plan-schedule') {
    if (!selectedDetailsPlan) return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><h1>This Plan could not be found.</h1><button onClick={() => { setStage('today'); setView('plans'); plans.retry(); }}>Return to Plans</button></section></main>;
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Plan schedule</span><h1>When will you work on {selectedDetailsPlan.title}?</h1><p>Choose working days and a weekly allocation. Clock times can be added later.</p><fieldset><legend>Working days</legend><div className="day-choices">{workingDays.map(day => <button type="button" key={day} aria-pressed={scheduleDraft.workingDays.includes(day)} className={scheduleDraft.workingDays.includes(day) ? '' : 'secondary'} onClick={() => { setScheduleDraft(current => ({ ...current, workingDays: current.workingDays.includes(day) ? current.workingDays.filter(value => value !== day) : [...current.workingDays, day] })); setScheduleErrors(current => ({ ...current, workingDays: undefined })); }}>{dayLabels[day]}</button>)}</div></fieldset>{scheduleErrors.workingDays && <small role="alert">{scheduleErrors.workingDays}</small>}<label>Hours for this Plan each week<input type="number" min="1" max="40" value={scheduleDraft.weeklyHours} onChange={event => { setScheduleDraft(current => ({ ...current, weeklyHours: Number(event.target.value) })); setScheduleErrors(current => ({ ...current, weeklyHours: undefined })); }} /></label>{scheduleErrors.weeklyHours && <small role="alert">{scheduleErrors.weeklyHours}</small>}{scheduleFailure === 'unavailable' && <div className="notice" role="alert">The schedule wasn’t saved. The existing Plan is unchanged. Check your connection and try again.</div>}{scheduleFailure === 'conflict' && <div className="notice" role="alert">This Plan was updated in another session. Your changes weren’t saved. Reload the Plan before editing again.<button onClick={() => { planDetails.retry(); setStage('plan-details'); }}>Reload Plan</button></div>}<div className="actions"><button onClick={savePlanSchedule} disabled={savingSchedule}>{savingSchedule ? 'Saving schedule…' : 'Save schedule'}</button><button className="secondary" onClick={() => setStage('plan-details')} disabled={savingSchedule}>Cancel</button></div></section></main>;
  }

  if (stage === 'plan-create') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Create a Plan</span><h1>What do you want to make progress on?</h1><p>Start with one meaningful outcome. You can refine it later.</p><form onSubmit={event => { event.preventDefault(); reviewPlan(); }} noValidate>
      <label>Plan title<input value={planDraft.title} maxLength={80} onChange={event => updatePlan('title', event.target.value)} aria-describedby={planErrors.title ? 'title-error' : undefined} /></label>{planErrors.title && <small id="title-error" role="alert">{planErrors.title}</small>}
      <label>Desired outcome<textarea value={planDraft.outcome} maxLength={300} onChange={event => updatePlan('outcome', event.target.value)} /></label>{planErrors.outcome && <small role="alert">{planErrors.outcome}</small>}
      <label>Why this matters<textarea value={planDraft.why} maxLength={300} onChange={event => updatePlan('why', event.target.value)} /></label>{planErrors.why && <small role="alert">{planErrors.why}</small>}
      <label>Target date<input type="date" min={localDate()} value={planDraft.targetDate} onChange={event => updatePlan('targetDate', event.target.value)} /></label>{planErrors.targetDate && <small role="alert">{planErrors.targetDate}</small>}
      <fieldset><legend>Working days for this Plan</legend><div className="day-choices">{workingDays.map(day => <button type="button" key={day} aria-pressed={planDraft.workingDays.includes(day)} className={planDraft.workingDays.includes(day) ? '' : 'secondary'} onClick={() => { setPlanDraft(current => ({ ...current, workingDays: current.workingDays.includes(day) ? current.workingDays.filter(value => value !== day) : [...current.workingDays, day] })); setPlanErrors(current => ({ ...current, workingDays: undefined })); }}>{dayLabels[day]}</button>)}</div></fieldset>{planErrors.workingDays && <small role="alert">{planErrors.workingDays}</small>}
      <label>Hours for this Plan each week<input type="number" min="1" max="40" value={planDraft.weeklyHours} onChange={event => updatePlan('weeklyHours', Number(event.target.value))} /></label>{planErrors.weeklyHours && <small role="alert">{planErrors.weeklyHours}</small>}
      <div className="actions"><button type="submit">Review Plan</button><button type="button" className="secondary" onClick={() => setStage('today')}>Cancel</button></div>
    </form></section></main>;
  }

  if (stage === 'plan-review') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Review your Plan</span><h1>{planDraft.title.trim()}</h1><dl><dt>Desired outcome</dt><dd>{planDraft.outcome.trim()}</dd><dt>Why it matters</dt><dd>{planDraft.why.trim()}</dd><dt>Target date</dt><dd>{formatLongDate(planDraft.targetDate)}</dd><dt>Working days</dt><dd>{orderWorkingDays(planDraft.workingDays).map(day => dayLabels[day]).join(', ')}</dd><dt>Weekly time</dt><dd>{planDraft.weeklyHours} hours</dd></dl>{planSaveFailed && <div className="notice" role="alert">Your Plan wasn’t saved. Check your connection and try again.</div>}<div className="actions"><button onClick={savePlan} disabled={savingPlan}>{savingPlan ? 'Saving Plan…' : 'Create Plan'}</button><button className="secondary" onClick={() => setStage('plan-create')} disabled={savingPlan}>Edit</button><button className="secondary" onClick={() => setStage('today')} disabled={savingPlan}>Cancel</button></div></section></main>;
  }

  if (stage === 'plan-saved') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card success"><span className="status">Plan saved</span><h1>{planDraft.title.trim()}</h1><p>Your Plan is ready. Longview will use it to shape your next useful step.</p><button onClick={() => setStage('today')}>Return to Today</button></section></main>;
  }

  if (stage === 'today') {
    return <main className="app-shell"><header><p className="eyebrow">Longview</p><span className="status">Plan-based schedules</span></header>
      {view === 'today' && <section className="today-view" aria-busy={plans.snapshot.status === 'idle' || plans.snapshot.status === 'loading'}><span className="status">Today</span>
        {(plans.snapshot.status === 'idle' || plans.snapshot.status === 'loading') && <div className="empty"><h1>Preparing Today…</h1><p>Finding one useful step from your saved Plans.</p></div>}
        {plans.snapshot.status === 'error' && <div className="empty"><h1>Today couldn’t be prepared.</h1><p>Your Plans are unchanged. Check your connection and try again.</p><button onClick={plans.retry}>Try again</button></div>}
        {plans.snapshot.status === 'ready' && !todayStep && plans.snapshot.plans.length === 0 && <div className="empty"><h1>Nothing is scheduled yet.</h1><p>Create your first Plan and choose the days you want to work on it.</p><button onClick={startNewPlan}>Create first Plan</button></div>}
        {plans.snapshot.status === 'ready' && !todayStep && plans.snapshot.plans.length > 0 && plans.snapshot.plans.some(plan => !plan.workingDays) && <div className="empty"><h1>A Plan needs a schedule.</h1><p>Open the Plan and add at least one working day before it can appear in Today.</p><button onClick={() => setView('plans')}>View Plans</button></div>}
        {plans.snapshot.status === 'ready' && !todayStep && plans.snapshot.plans.length > 0 && plans.snapshot.plans.every(plan => plan.workingDays) && <div className="empty"><h1>Nothing scheduled today.</h1><p>{nextScheduledDate ? `Your next scheduled Plan day is ${formatLongDate(nextScheduledDate)}.` : 'No active Plan has an upcoming working day.'}</p><button onClick={() => setView('plans')}>View Plans</button></div>}
        {plans.snapshot.status === 'ready' && todayStep && completion.snapshot.status === 'ready' && completion.snapshot.completion && <div className="today-content"><h1>Today’s step is complete.</h1><p>You recorded meaningful progress without changing your Plan.</p><TodayStepCard step={todayStep} completed /><button className="secondary" onClick={() => setView('plans')}>View all Plans</button></div>}
        {plans.snapshot.status === 'ready' && todayStep && completion.snapshot.status !== 'ready' && <div className="today-content"><h1>One useful step is enough.</h1><p>Start with the nearest active Plan. You can refine the step later.</p><TodayStepCard step={todayStep} />{completion.snapshot.status === 'error' ? <div className="notice" role="alert">Progress couldn’t be checked. Nothing was changed.<button onClick={completion.retry}>Try again</button></div> : <button disabled>Checking progress…</button>}</div>}
        {plans.snapshot.status === 'ready' && todayStep && completion.snapshot.status === 'ready' && !completion.snapshot.completion && <div className="today-content"><h1>One useful step is enough.</h1><p>Start with the nearest active Plan. You can refine the step later.</p><TodayStepCard step={todayStep} />{showClara ? <ClaraPanel clara={clara} onClose={() => { clara.cancel(); setShowClara(false); }} /> : <button className="secondary" onClick={askClara}>Ask Clara about this step</button>}{completion.saveFailed && <div className="notice" role="alert">Completion wasn’t saved. Your step is still open. Try again.</div>}{confirmComplete ? <div className="notice" role="alert"><p>Mark this step complete for today? Your Plan and schedule will stay the same.</p><div className="actions"><button onClick={async () => { if (await completion.complete()) setConfirmComplete(false); }} disabled={completion.completing}>{completion.completing ? 'Saving completion…' : 'Confirm completion'}</button><button className="secondary" onClick={() => setConfirmComplete(false)} disabled={completion.completing}>Keep working</button></div></div> : <div className="actions"><button onClick={() => setConfirmComplete(true)}>Mark step complete</button><button className="secondary" onClick={() => setView('plans')}>View all Plans</button></div>}</div>}
      </section>}
      {view === 'plans' && <section className="plans-view" aria-busy={plans.snapshot.status === 'loading'}><span className="status">Plans</span>
        {(plans.snapshot.status === 'idle' || plans.snapshot.status === 'loading') && <div className="empty"><h1>Loading your Plans…</h1><p>Bringing your priorities into view.</p></div>}
        {plans.snapshot.status === 'error' && <div className="empty"><h1>Your Plans couldn’t be loaded.</h1><p>Check your connection and try again. Nothing has been changed.</p><button onClick={plans.retry}>Try again</button></div>}
        {plans.snapshot.status === 'ready' && plans.snapshot.plans.length === 0 && <div className="empty"><h1>No Plans yet.</h1><p>Your long-term priorities will appear here after you create your first Plan.</p><button onClick={startNewPlan}>Create first Plan</button></div>}
        {plans.snapshot.status === 'ready' && plans.snapshot.plans.length > 0 && <><div className="plans-heading"><div><h1>Your Plans</h1><p>See how every active Plan shares your committed weekly time.</p></div><button onClick={startNewPlan}>Create Plan</button></div><section className="portfolio-summary"><div><span className="status">Committed weekly time</span><strong>{portfolio.totalWeeklyHours} hours</strong><small>Across {portfolio.entries.length} active {portfolio.entries.length === 1 ? 'Plan' : 'Plans'}</small></div><div className="allocation-list">{portfolio.entries.map(entry => <div key={entry.plan.id}><span>{entry.plan.title}</span><strong>{entry.plan.weeklyHours}h · {entry.percent}%</strong></div>)}</div></section><div className="notice"><strong>Portfolio guidance</strong><p>{portfolio.recommendation}</p><small>Suggested from target dates and current allocations. Nothing was changed.</small></div><div className="plan-grid">{portfolio.entries.map(({ plan, mode, percent }) => <article className="plan-card" key={plan.id}><span className="status">{mode} · {percent}% of committed time</span><h2>{plan.title}</h2><p>{plan.outcome}</p><dl><dt>Milestone</dt><dd>Reach target by {formatLongDate(plan.targetDate)}</dd><dt>Working days</dt><dd>{plan.workingDays ? orderWorkingDays(plan.workingDays).map(day => dayLabels[day]).join(', ') : 'Not set'}</dd><dt>Weekly time</dt><dd>{plan.weeklyHours} hours</dd></dl><button onClick={() => openPlanDetails(plan)}>View Plan details</button></article>)}</div></>}
      </section>}
      {view === 'settings' && <section className="empty"><span className="status">Settings</span><h1>Account and privacy</h1><p>Plan schedules are managed inside each Plan.</p>{snapshot.user.isAnonymous && !confirmSignOut && !confirmClear && <button onClick={auth.linkGoogle} disabled={snapshot.linking}>{snapshot.linking ? 'Opening Google…' : 'Link Google account'}</button>}<div className="actions"><button className="secondary" onClick={() => snapshot.user.isAnonymous ? setConfirmSignOut(true) : auth.signOut()}>Sign out</button><button className="danger" onClick={() => setConfirmClear(true)}>Clear this device</button></div>{snapshot.failure && <div className="notice" role="alert">{failureCopy[snapshot.failure]}{snapshot.failure === 'account-conflict' && snapshot.user.isAnonymous && <button onClick={auth.useExistingGoogle}>Use existing Google workspace</button>}</div>}{confirmSignOut && <div className="notice" role="alert"><p>If you sign out now, you won’t be able to return to this workspace. Link a Google account first if you want to keep access.</p><div className="actions"><button onClick={auth.linkGoogle}>Link Google account</button><button className="danger" onClick={auth.signOut}>Sign out and lose access</button><button className="secondary" onClick={() => setConfirmSignOut(false)}>Cancel</button></div></div>}{confirmClear && <div className="notice" role="alert"><p>{snapshot.user.isAnonymous ? 'Clearing this device will sign you out. Because you’re using Longview without an account, you won’t be able to return to this workspace. Link Google first to keep access.' : 'This removes Longview’s saved settings from this device and signs you out. Your workspace will still be available when you sign in again.'}</p><div className="actions">{snapshot.user.isAnonymous && <button onClick={auth.linkGoogle}>Link Google account</button>}<button className="danger" onClick={clearLocalData}>Clear this device and sign out</button><button className="secondary" onClick={() => setConfirmClear(false)}>Cancel</button></div></div>}</section>}
      <nav aria-label="Primary"><button aria-current={view === 'today' ? 'page' : undefined} className={view === 'today' ? '' : 'secondary'} onClick={() => setView('today')}>Today</button><button aria-current={view === 'plans' ? 'page' : undefined} className={view === 'plans' ? '' : 'secondary'} onClick={() => setView('plans')}>Plans</button><button aria-current={view === 'settings' ? 'page' : undefined} className={view === 'settings' ? '' : 'secondary'} onClick={() => setView('settings')}>Settings</button></nav></main>;
  }

  return (
    <main className="shell">
      <p className="eyebrow">Longview</p>
      <section className="card success">
        <span className="status">Workspace ready</span>
        <h1>{snapshot.user.isAnonymous ? 'You’re continuing privately.' : `Welcome${snapshot.user.displayName ? `, ${snapshot.user.displayName}` : ''}.`}</h1>
        <p>{snapshot.user.isAnonymous
          ? 'Your anonymous workspace stays on this account. Link Google when you want access across devices.'
          : 'Your workspace is protected by your Google account.'}</p>
        {snapshot.failure && <div className="notice" role="alert">{failureCopy[snapshot.failure]}</div>}
        {snapshot.failure === 'account-conflict' && snapshot.user.isAnonymous && <button onClick={auth.useExistingGoogle}>Use existing Google workspace</button>}
        {snapshot.user.isAnonymous && <div className="actions"><button onClick={continueSetup}>Continue setup</button><button className="secondary" onClick={auth.linkGoogle} disabled={snapshot.linking}>{snapshot.linking ? 'Opening Google…' : 'Link Google account'}</button></div>}
        {!snapshot.user.isAnonymous && <button onClick={continueSetup}>Continue setup</button>}
      </section>
    </main>
  );
}

export function App({ gateway = firebaseAuthGateway, workspaceGateway = lazyFirebaseWorkspaceGateway, planGateway = lazyFirebasePlanGateway, todayGateway = lazyFirebaseTodayGateway, claraGateway = previewClaraGateway }: { gateway?: AuthGateway; workspaceGateway?: WorkspaceGateway; planGateway?: PlanGateway; todayGateway?: TodayGateway; claraGateway?: ClaraGateway }) {
  const auth = useAuth(gateway);
  const { snapshot } = auth;

  if (snapshot.status === 'loading') {
    return <main className="shell" aria-busy="true"><p className="eyebrow">Longview</p><h1>Restoring your workspace…</h1></main>;
  }

  if (snapshot.status === 'authenticated') {
    return <WorkspaceReady auth={auth} gateway={workspaceGateway} planGateway={planGateway} todayGateway={todayGateway} claraGateway={claraGateway} />;
  }

  return (
    <main className="shell">
      <p className="eyebrow">Longview</p>
      <section className="card">
        <span className="status">Choose how to begin</span>
        <h1>Make progress without rebuilding the plan every day.</h1>
        <p>Start immediately without sharing personal information, or use Google for access across devices.</p>
        {snapshot.failure && <div className="notice" role="alert">{failureCopy[snapshot.failure]}</div>}
        <div className="actions">
          <button onClick={auth.continueAnonymously}>Continue anonymously</button>
          <button className="secondary" onClick={auth.continueWithGoogle}>Continue with Google</button>
        </div>
        <small>Linking later keeps one workspace. Longview never silently merges two accounts.</small>
      </section>
    </main>
  );
}
