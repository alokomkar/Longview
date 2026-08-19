import type { ReactNode } from 'react';

export type PrimarySection = 'today' | 'calendar' | 'plans' | 'settings';

const labels: Record<PrimarySection, string> = {
  today: 'Today',
  calendar: 'Calendar',
  plans: 'Plans',
  settings: 'Settings'
};

const glyphs: Record<PrimarySection, string> = {
  today: '●',
  calendar: '□',
  plans: '◇',
  settings: '⚙'
};

export interface AppNavigationProps {
  section: PrimarySection;
  screen: string;
  breadcrumb?: string;
  backLabel?: string;
  onBack?: () => void;
  calendarEnabled: boolean;
  onNavigate: (section: PrimarySection) => void;
  children: ReactNode;
}

const destinations = (calendarEnabled: boolean): PrimarySection[] =>
  calendarEnabled ? ['today', 'calendar', 'plans', 'settings'] : ['today', 'plans', 'settings'];

function NavigationItems({ section, calendarEnabled, onNavigate }: {
  section: PrimarySection;
  calendarEnabled: boolean;
  onNavigate: (section: PrimarySection) => void;
}) {
  return <>{destinations(calendarEnabled).map(destination => <button
    key={destination}
    type="button"
    className="primary-navigation-item"
    aria-current={destination === section ? 'page' : undefined}
    onClick={() => onNavigate(destination)}
  ><span aria-hidden="true">{glyphs[destination]}</span>{labels[destination]}</button>)}</>;
}

export function AppNavigation({ section, screen, breadcrumb, backLabel, onBack, calendarEnabled, onNavigate, children }: AppNavigationProps) {
  const nested = screen !== labels[section];
  return <main className="app-shell app-shell-with-navigation">
    <aside className="desktop-navigation">
      <strong className="desktop-navigation-brand">Longview</strong>
      <nav className="primary-navigation" aria-label="Primary navigation">
        <NavigationItems section={section} calendarEnabled={calendarEnabled} onNavigate={onNavigate} />
      </nav>
      <div className="desktop-navigation-context"><strong>Current section</strong><span>{labels[section]}</span><small>Nested screens keep this selection.</small></div>
    </aside>
    <div className="app-main">
      <header className="screen-location">
        <div className="screen-location-brand"><span className="eyebrow">Longview</span><span className="screen-location-section" aria-label={`Current section: ${labels[section]}`}>{labels[section]}</span></div>
        {nested && <div className="screen-location-route">{onBack && backLabel && <button type="button" className="secondary compact" onClick={onBack}>← {backLabel}</button>}<div><small>{breadcrumb ?? `${labels[section]} / ${screen}`}</small><strong>{screen}</strong></div></div>}
      </header>
      {children}
    </div>
  </main>;
}

export function sectionForView(view: string): PrimarySection {
  if (view === 'calendar') return 'calendar';
  if (view === 'plans') return 'plans';
  if (view === 'settings') return 'settings';
  return 'today';
}
