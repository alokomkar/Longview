import { describe, expect, it } from 'vitest';
import { claraQuickActionGroups, findClaraQuickActionGroup } from './quickActions';

describe('Clara Quick Actions', () => {
  it('keeps every action unique and routed to a reviewed existing surface', () => {
    const actions = claraQuickActionGroups.flatMap(group => group.actions);
    expect(new Set(actions.map(action => action.id)).size).toBe(actions.length);
    expect(actions.every(action => action.target === 'calendar' || action.target === 'plans')).toBe(true);
  });

  it('exposes the reviewed Plan my day journey', () => {
    const group = findClaraQuickActionGroup('plan-day');
    expect(group.title).toBe('Plan my day');
    expect(group.actions[0]).toMatchObject({ id: 'prepare-day', target: 'calendar' });
  });
});
