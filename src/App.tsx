import { firebaseAuthGateway } from './auth/firebaseGateway';
import { useAuth } from './auth/useAuth';
import type { AuthFailure, AuthGateway } from './auth/types';
import { lazyFirebaseWorkspaceGateway } from './workspace/lazyWorkspaceGateway';
import type { WorkspaceGateway } from './workspace/types';
import { useWorkspace } from './workspace/useWorkspace';
import { lazyFirebasePlanGateway } from './plan/lazyPlanGateway';
import { validatePlanDraft, type PlanDraft, type PlanErrors, type PlanGateway } from './plan/types';
import { usePlans } from './plan/usePlans';
import { useState } from 'react';
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

function WorkspaceReady({ auth, gateway, planGateway }: {
  auth: ReturnType<typeof useAuth>;
  gateway: WorkspaceGateway;
  planGateway: PlanGateway;
}) {
  const snapshot = auth.snapshot;
  if (snapshot.status !== 'authenticated') return null;
  const workspace = useWorkspace(snapshot.user, gateway);
  const [stage, setStage] = useState<'workspace' | 'availability' | 'today' | 'plan-create' | 'plan-review' | 'plan-saved'>(() =>
    localStorage.getItem('longview:onboarding') === 'complete' ? 'today' : 'workspace'
  );
  const [hours, setHours] = useState(10);
  const [view, setView] = useState<'today' | 'plans' | 'settings'>('today');
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [planDraft, setPlanDraft] = useState<PlanDraft>(() => ({
    clientRequestId: requestId(), title: '', outcome: '', why: '', targetDate: localDate(), weeklyHours: 5
  }));
  const [planErrors, setPlanErrors] = useState<PlanErrors>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSaveFailed, setPlanSaveFailed] = useState(false);
  const plans = usePlans(snapshot.user, planGateway, stage === 'today' && view === 'plans');

  const updatePlan = (field: keyof PlanDraft, value: string | number) => {
    setPlanDraft(current => ({ ...current, [field]: value }));
    setPlanErrors(current => ({ ...current, [field]: undefined }));
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

  if (stage === 'availability') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Your availability</span><h1>Protect time you can actually keep.</h1><p>Choose a realistic weekly planning budget. You can change this later.</p><div className="choices" role="group" aria-label="Weekly availability">{[5, 10, 15].map(value => <button key={value} className={hours === value ? '' : 'secondary'} onClick={() => setHours(value)}>{value} hours</button>)}</div><button onClick={() => { localStorage.setItem('longview:onboarding', 'complete'); setStage('today'); }}>Save availability</button></section></main>;
  }

  if (stage === 'plan-create') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Create a Plan</span><h1>What do you want to make progress on?</h1><p>Start with one meaningful outcome. You can refine it later.</p><form onSubmit={event => { event.preventDefault(); reviewPlan(); }} noValidate>
      <label>Plan title<input value={planDraft.title} maxLength={80} onChange={event => updatePlan('title', event.target.value)} aria-describedby={planErrors.title ? 'title-error' : undefined} /></label>{planErrors.title && <small id="title-error" role="alert">{planErrors.title}</small>}
      <label>Desired outcome<textarea value={planDraft.outcome} maxLength={300} onChange={event => updatePlan('outcome', event.target.value)} /></label>{planErrors.outcome && <small role="alert">{planErrors.outcome}</small>}
      <label>Why this matters<textarea value={planDraft.why} maxLength={300} onChange={event => updatePlan('why', event.target.value)} /></label>{planErrors.why && <small role="alert">{planErrors.why}</small>}
      <label>Target date<input type="date" min={localDate()} value={planDraft.targetDate} onChange={event => updatePlan('targetDate', event.target.value)} /></label>{planErrors.targetDate && <small role="alert">{planErrors.targetDate}</small>}
      <label>Hours available each week<input type="number" min="1" max="40" value={planDraft.weeklyHours} onChange={event => updatePlan('weeklyHours', Number(event.target.value))} /></label>{planErrors.weeklyHours && <small role="alert">{planErrors.weeklyHours}</small>}
      <div className="actions"><button type="submit">Review Plan</button><button type="button" className="secondary" onClick={() => setStage('today')}>Cancel</button></div>
    </form></section></main>;
  }

  if (stage === 'plan-review') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Review your Plan</span><h1>{planDraft.title.trim()}</h1><dl><dt>Desired outcome</dt><dd>{planDraft.outcome.trim()}</dd><dt>Why it matters</dt><dd>{planDraft.why.trim()}</dd><dt>Target date</dt><dd>{planDraft.targetDate}</dd><dt>Weekly time</dt><dd>{planDraft.weeklyHours} hours</dd></dl>{planSaveFailed && <div className="notice" role="alert">Your Plan wasn’t saved. Check your connection and try again.</div>}<div className="actions"><button onClick={savePlan} disabled={savingPlan}>{savingPlan ? 'Saving Plan…' : 'Create Plan'}</button><button className="secondary" onClick={() => setStage('plan-create')} disabled={savingPlan}>Edit</button><button className="secondary" onClick={() => setStage('today')} disabled={savingPlan}>Cancel</button></div></section></main>;
  }

  if (stage === 'plan-saved') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card success"><span className="status">Plan saved</span><h1>{planDraft.title.trim()}</h1><p>Your Plan is ready. Longview will use it to shape your next useful step.</p><button onClick={() => setStage('today')}>Return to Today</button></section></main>;
  }

  if (stage === 'today') {
    return <main className="app-shell"><header><p className="eyebrow">Longview</p><span className="status">{hours} hours/week</span></header>
      {view === 'today' && <section className="empty"><span className="status">Today</span><h1>Nothing is scheduled yet.</h1><p>Create your first Plan and Longview will shape a realistic day around your availability.</p><button onClick={() => setStage('plan-create')}>Create first Plan</button></section>}
      {view === 'plans' && <section className="plans-view" aria-busy={plans.snapshot.status === 'loading'}><span className="status">Plans</span>
        {plans.snapshot.status === 'loading' && <div className="empty"><h1>Loading your Plans…</h1><p>Bringing your priorities into view.</p></div>}
        {plans.snapshot.status === 'error' && <div className="empty"><h1>Your Plans couldn’t be loaded.</h1><p>Check your connection and try again. Nothing has been changed.</p><button onClick={plans.retry}>Try again</button></div>}
        {plans.snapshot.status === 'ready' && plans.snapshot.plans.length === 0 && <div className="empty"><h1>No Plans yet.</h1><p>Your long-term priorities will appear here after you create your first Plan.</p><button onClick={() => setStage('plan-create')}>Create first Plan</button></div>}
        {plans.snapshot.status === 'ready' && plans.snapshot.plans.length > 0 && <><div className="plans-heading"><div><h1>Your Plans</h1><p>Keep your meaningful outcomes in one place.</p></div><button onClick={() => setStage('plan-create')}>Create Plan</button></div><div className="plan-grid">{plans.snapshot.plans.map(plan => <article className="plan-card" key={plan.id}><span className="status">{plan.status}</span><h2>{plan.title}</h2><p>{plan.outcome}</p><dl><dt>Target</dt><dd>{plan.targetDate}</dd><dt>Weekly time</dt><dd>{plan.weeklyHours} hours</dd></dl></article>)}</div></>}
      </section>}
      {view === 'settings' && <section className="empty"><span className="status">Settings</span><h1>Account and this device</h1><p>Sign out to switch accounts, or clear this device to remove Longview’s saved settings.</p>{snapshot.user.isAnonymous && !confirmSignOut && !confirmClear && <button onClick={auth.linkGoogle} disabled={snapshot.linking}>{snapshot.linking ? 'Opening Google…' : 'Link Google account'}</button>}<div className="actions"><button className="secondary" onClick={() => snapshot.user.isAnonymous ? setConfirmSignOut(true) : auth.signOut()}>Sign out</button><button className="danger" onClick={() => setConfirmClear(true)}>Clear this device</button></div>{snapshot.failure && <div className="notice" role="alert">{failureCopy[snapshot.failure]}{snapshot.failure === 'account-conflict' && snapshot.user.isAnonymous && <button onClick={auth.useExistingGoogle}>Use existing Google workspace</button>}</div>}{confirmSignOut && <div className="notice" role="alert"><p>If you sign out now, you won’t be able to return to this workspace. Link a Google account first if you want to keep access.</p><div className="actions"><button onClick={auth.linkGoogle}>Link Google account</button><button className="danger" onClick={auth.signOut}>Sign out and lose access</button><button className="secondary" onClick={() => setConfirmSignOut(false)}>Cancel</button></div></div>}{confirmClear && <div className="notice" role="alert"><p>{snapshot.user.isAnonymous ? 'Clearing this device will sign you out. Because you’re using Longview without an account, you won’t be able to return to this workspace. Link Google first to keep access.' : 'This removes Longview’s saved settings from this device and signs you out. Your workspace will still be available when you sign in again.'}</p><div className="actions">{snapshot.user.isAnonymous && <button onClick={auth.linkGoogle}>Link Google account</button>}<button className="danger" onClick={clearLocalData}>Clear this device and sign out</button><button className="secondary" onClick={() => setConfirmClear(false)}>Cancel</button></div></div>}</section>}
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
        {snapshot.user.isAnonymous && <div className="actions"><button onClick={() => setStage('availability')}>Continue setup</button><button className="secondary" onClick={auth.linkGoogle} disabled={snapshot.linking}>{snapshot.linking ? 'Opening Google…' : 'Link Google account'}</button></div>}
        {!snapshot.user.isAnonymous && <button onClick={() => setStage('availability')}>Continue setup</button>}
      </section>
    </main>
  );
}

export function App({ gateway = firebaseAuthGateway, workspaceGateway = lazyFirebaseWorkspaceGateway, planGateway = lazyFirebasePlanGateway }: { gateway?: AuthGateway; workspaceGateway?: WorkspaceGateway; planGateway?: PlanGateway }) {
  const auth = useAuth(gateway);
  const { snapshot } = auth;

  if (snapshot.status === 'loading') {
    return <main className="shell" aria-busy="true"><p className="eyebrow">Longview</p><h1>Restoring your workspace…</h1></main>;
  }

  if (snapshot.status === 'authenticated') {
    return <WorkspaceReady auth={auth} gateway={workspaceGateway} planGateway={planGateway} />;
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
