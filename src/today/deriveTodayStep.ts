import type { Plan } from '../plan/types';

export type TodayStep = {
  planId: string;
  planTitle: string;
  title: string;
  description: string;
  durationMinutes: number;
  targetDate: string;
};

const compare = (left: Plan, right: Plan) => {
  if (left.targetDate !== right.targetDate) return left.targetDate < right.targetDate ? -1 : 1;
  if (left.title !== right.title) return left.title < right.title ? -1 : 1;
  return left.id < right.id ? -1 : left.id === right.id ? 0 : 1;
};

export function deriveTodayStep(plans: Plan[]): TodayStep | null {
  const plan = [...plans].filter(item => item.status === 'active').sort(compare)[0];
  if (!plan) return null;
  return {
    planId: plan.id,
    planTitle: plan.title,
    title: 'Define the first proof of progress',
    description: `Write one observable result that would prove progress toward this outcome: ${plan.outcome} Then name the smallest action you can finish this week.`,
    durationMinutes: Math.max(30, Math.min(60, plan.weeklyHours * 15)),
    targetDate: plan.targetDate
  };
}
