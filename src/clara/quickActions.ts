export type ClaraQuickActionTarget = 'calendar' | 'plans';

export type ClaraQuickAction = {
  id: string;
  title: string;
  description: string;
  target: ClaraQuickActionTarget;
};

export type ClaraQuickActionGroupId = 'plan-day' | 'prioritize' | 'move-work' | 'review-progress';

export type ClaraQuickActionGroup = {
  id: ClaraQuickActionGroupId;
  title: string;
  description: string;
  actions: readonly ClaraQuickAction[];
};

export const claraQuickActionGroups: readonly ClaraQuickActionGroup[] = [
  {
    id: 'plan-day',
    title: 'Plan my day',
    description: 'Build or review today’s schedule from your active Plans.',
    actions: [
      { id: 'prepare-day', title: 'Build today’s schedule', description: 'Prepare one proposal using today’s eligible Plan steps.', target: 'calendar' },
      { id: 'review-day', title: 'Review today’s saved schedule', description: 'Open the latest approved day before replacing anything.', target: 'calendar' },
      { id: 'try-window', title: 'Try a different planning window', description: 'Choose a new time limit, then prepare another proposal.', target: 'calendar' }
    ]
  },
  {
    id: 'prioritize',
    title: 'Prioritize',
    description: 'Review allocation and the tradeoff across active Plans.',
    actions: [
      { id: 'review-allocation', title: 'Review weekly allocation', description: 'Compare hours and allocation shares across active Plans.', target: 'plans' },
      { id: 'review-deadlines', title: 'Review upcoming targets', description: 'Inspect milestones before deciding which Plan to protect.', target: 'plans' }
    ]
  },
  {
    id: 'move-work',
    title: 'Move work',
    description: 'Review schedule and break options without changing anything yet.',
    actions: [
      { id: 'review-calendar', title: 'Review today’s schedule', description: 'Open the approved day and its available review actions.', target: 'calendar' },
      { id: 'review-break', title: 'Review taking a break', description: 'See carryover destinations before confirming a break.', target: 'calendar' }
    ]
  },
  {
    id: 'review-progress',
    title: 'Review progress',
    description: 'Return to the Plans and progress already saved.',
    actions: [
      { id: 'review-plans', title: 'Review active Plans', description: 'Open the portfolio and inspect each Plan’s current context.', target: 'plans' }
    ]
  }
] as const;

export function findClaraQuickActionGroup(id: ClaraQuickActionGroupId): ClaraQuickActionGroup {
  const group = claraQuickActionGroups.find(value => value.id === id);
  if (!group) throw new Error(`Unknown Clara Quick Action group: ${id}`);
  return group;
}
