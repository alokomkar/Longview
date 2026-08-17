import type { Plan } from './types';

export type PortfolioMode = 'Focus' | 'Maintain' | 'Prepare';
export type PortfolioEntry = { plan: Plan; mode: PortfolioMode; percent: number };
export type PortfolioSummary = { entries: PortfolioEntry[]; totalWeeklyHours: number; recommendation: string };

const comparePlans = (left: Plan, right: Plan) =>
  left.targetDate.localeCompare(right.targetDate) || left.id.localeCompare(right.id);

export function derivePortfolio(plans: Plan[]): PortfolioSummary {
  const active = plans.filter(plan => plan.status === 'active').sort(comparePlans);
  const totalWeeklyHours = active.reduce((total, plan) => total + plan.weeklyHours, 0);
  const entries = active.map((plan, index) => ({
    plan,
    mode: index === 0 ? 'Focus' as const : index === 1 ? 'Maintain' as const : 'Prepare' as const,
    percent: totalWeeklyHours === 0 ? 0 : Math.round(plan.weeklyHours / totalWeeklyHours * 100)
  }));
  const first = entries[0]?.plan;
  const recommendation = first
    ? active.length === 1
      ? `Protect ${first.title} until its ${first.targetDate} target.`
      : `Protect ${first.title}, the nearest target. Review the other allocations first if time becomes tight.`
    : 'Create a Plan to start allocating your weekly time.';
  return { entries, totalWeeklyHours, recommendation };
}
