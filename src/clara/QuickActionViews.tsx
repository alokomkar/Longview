import {
  claraQuickActionGroups,
  findClaraQuickActionGroup,
  type ClaraQuickActionGroupId,
  type ClaraQuickActionTarget
} from './quickActions';

export function ClaraHome({ planCount, taskCount, onOpenActions, onAskAboutStep, onReturn }: {
  planCount: number;
  taskCount: number;
  onOpenActions: () => void;
  onAskAboutStep: () => void;
  onReturn: () => void;
}) {
  return <section className="clara-view"><span className="status">Ask Clara</span><h1>Choose how Clara can help with Today.</h1><div className="clara-context"><strong>Context ready · Today</strong><p>{planCount} active {planCount === 1 ? 'Plan' : 'Plans'} and {taskCount} eligible {taskCount === 1 ? 'step' : 'steps'}. No unrelated workspace data is attached.</p></div><div className="clara-doors"><button className="clara-door" onClick={onOpenActions}><span>Quick Actions</span><small>Choose a bounded action grouped by outcome.</small></button><button className="clara-door" onClick={onAskAboutStep}><span>Ask about today’s step</span><small>Get the existing read-only recommendation for this Plan.</small></button></div><div className="notice"><strong>Review before applying</strong><p>Quick Actions open an existing review flow. A schedule or allocation does not change until you approve its exact preview.</p></div><button className="secondary" onClick={onReturn}>Return to Today</button></section>;
}

export function ClaraQuickActions({ onOpenGroup, onReturn }: {
  onOpenGroup: (group: ClaraQuickActionGroupId) => void;
  onReturn: () => void;
}) {
  return <section className="clara-view"><span className="status">Quick Actions · Today</span><h1>What outcome do you want?</h1><p>These actions use only the Plans and schedule already visible in Longview.</p><div className="quick-action-grid">{claraQuickActionGroups.map(group => <button className="quick-action-group" key={group.id} onClick={() => onOpenGroup(group.id)}><strong>{group.title}</strong><span>{group.description}</span><small>{group.actions.length} {group.actions.length === 1 ? 'action' : 'actions'}</small></button>)}</div><div className="notice"><strong>Safe by default</strong><p>Opening an action does not call the network or change saved data. Any network step shows progress and any write requires review.</p></div><button className="secondary" onClick={onReturn}>Back to Ask Clara</button></section>;
}

export function ClaraQuickActionDetail({ groupId, onChoose, onReturn }: {
  groupId: ClaraQuickActionGroupId;
  onChoose: (target: ClaraQuickActionTarget) => void;
  onReturn: () => void;
}) {
  const group = findClaraQuickActionGroup(groupId);
  return <section className="clara-view"><span className="status">Quick Actions · {group.title}</span><h1>{group.title}</h1><p>{group.description}</p><div className="quick-action-list">{group.actions.map(action => <button key={action.id} onClick={() => onChoose(action.target)}><strong>{action.title}</strong><span>{action.description}</span></button>)}</div><small>Choosing an action opens its existing review screen. Nothing is applied automatically.</small><button className="secondary" onClick={onReturn}>Back to Quick Actions</button></section>;
}
