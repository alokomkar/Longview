import { firebaseAuthGateway } from './auth/firebaseGateway';
import { useAuth } from './auth/useAuth';
import type { AuthFailure, AuthGateway } from './auth/types';
import { lazyFirebaseWorkspaceGateway } from './workspace/lazyWorkspaceGateway';
import type { WorkspaceGateway } from './workspace/types';
import { useWorkspace } from './workspace/useWorkspace';
import { useState } from 'react';
import './styles.css';

const failureCopy: Record<AuthFailure, string> = {
  cancelled: 'Sign-in was cancelled. Nothing changed—try again or continue anonymously.',
  'popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for Longview and retry.',
  'account-conflict': 'That Google account is already connected. Your anonymous workspace was not changed.',
  offline: 'You appear to be offline. Reconnect and try again; local access remains unchanged.',
  unknown: 'Sign-in could not be completed. Nothing was changed.'
};

function WorkspaceReady({ auth, gateway }: {
  auth: ReturnType<typeof useAuth>;
  gateway: WorkspaceGateway;
}) {
  const snapshot = auth.snapshot;
  if (snapshot.status !== 'authenticated') return null;
  const workspace = useWorkspace(snapshot.user, gateway);
  const [stage, setStage] = useState<'workspace' | 'availability' | 'today'>(() =>
    localStorage.getItem('longview:onboarding') === 'complete' ? 'today' : 'workspace'
  );
  const [hours, setHours] = useState(10);

  if (workspace.snapshot.status === 'loading') {
    return <main className="shell" aria-busy="true"><p className="eyebrow">Longview</p><h1>Preparing your workspace…</h1></main>;
  }

  if (workspace.snapshot.status === 'error') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Workspace unavailable</span><h1>Your account is safe.</h1><p>Longview could not prepare the workspace. Check the local emulator and retry.</p><button onClick={workspace.retry}>Retry workspace setup</button></section></main>;
  }

  if (stage === 'availability') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Your availability</span><h1>Protect time you can actually keep.</h1><p>Choose a realistic weekly planning budget. You can change this later.</p><div className="choices" role="group" aria-label="Weekly availability">{[5, 10, 15].map(value => <button key={value} className={hours === value ? '' : 'secondary'} onClick={() => setHours(value)}>{value} hours</button>)}</div><button onClick={() => { localStorage.setItem('longview:onboarding', 'complete'); setStage('today'); }}>Save availability</button></section></main>;
  }

  if (stage === 'today') {
    return <main className="app-shell"><header><p className="eyebrow">Longview</p><span className="status">{hours} hours/week</span></header><section className="empty"><span className="status">Today</span><h1>Nothing is scheduled yet.</h1><p>Create your first Plan and Longview will shape a realistic day around your availability.</p><button>Create first Plan</button></section><nav aria-label="Primary"><button aria-current="page">Today</button><button className="secondary">Plans</button><button className="secondary">Settings</button></nav></main>;
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
        {snapshot.user.isAnonymous && <button onClick={auth.linkGoogle} disabled={snapshot.linking}>{snapshot.linking ? 'Opening Google…' : 'Link Google account'}</button>}
        {!snapshot.user.isAnonymous && <button onClick={() => setStage('availability')}>Continue setup</button>}
      </section>
    </main>
  );
}

export function App({ gateway = firebaseAuthGateway, workspaceGateway = lazyFirebaseWorkspaceGateway }: { gateway?: AuthGateway; workspaceGateway?: WorkspaceGateway }) {
  const auth = useAuth(gateway);
  const { snapshot } = auth;

  if (snapshot.status === 'loading') {
    return <main className="shell" aria-busy="true"><p className="eyebrow">Longview</p><h1>Restoring your workspace…</h1></main>;
  }

  if (snapshot.status === 'authenticated') {
    return <WorkspaceReady auth={auth} gateway={workspaceGateway} />;
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
