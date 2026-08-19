import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppNavigation, sectionForView } from './AppNavigation';

describe('AppNavigation', () => {
  it.each([
    ['today', 'today'],
    ['calendar', 'calendar'],
    ['plans', 'plans'],
    ['settings', 'settings'],
    ['clara-home', 'today'],
    ['clara-actions', 'today']
  ])('maps %s to its parent section', (view, expected) => {
    expect(sectionForView(view)).toBe(expected);
  });

  it('keeps one selected destination in the responsive navigation', () => {
    render(<AppNavigation section="plans" screen="Plans" calendarEnabled onNavigate={vi.fn()}><h1>Your Plans</h1></AppNavigation>);
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(within(navigation).getAllByRole('button')).toHaveLength(4);
    expect(within(navigation).getByRole('button', { name: /Plans/ })).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getAllByRole('button').filter(button => button.hasAttribute('aria-current'))).toHaveLength(1);
  });

  it('shows a breadcrumb and functional Back action on a nested screen', () => {
    const onBack = vi.fn();
    render(<AppNavigation section="plans" screen="Plan details" breadcrumb="Plans / Launch Longview" backLabel="Back to Plans" onBack={onBack} calendarEnabled onNavigate={vi.fn()}><h1>Launch Longview</h1></AppNavigation>);
    expect(screen.getByText('Plans / Launch Longview')).toBeVisible();
    expect(screen.getByText('Plan details')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '← Back to Plans' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('hides Calendar when the release surface does not expose it', () => {
    render(<AppNavigation section="today" screen="Today" calendarEnabled={false} onNavigate={vi.fn()}><h1>Today</h1></AppNavigation>);
    expect(screen.queryByRole('button', { name: /Calendar/ })).not.toBeInTheDocument();
  });

  it('routes destinations through one callback', () => {
    const onNavigate = vi.fn();
    render(<AppNavigation section="today" screen="Today" calendarEnabled onNavigate={onNavigate}><h1>Today</h1></AppNavigation>);
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    fireEvent.click(within(navigation).getByRole('button', { name: /Settings/ }));
    fireEvent.click(within(navigation).getByRole('button', { name: /Plans/ }));
    expect(onNavigate.mock.calls).toEqual([['settings'], ['plans']]);
  });
});
