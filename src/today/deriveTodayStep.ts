import type { Plan } from '../plan/types';
import type { WorkingDay } from '../plan/types';

export type TodayStep = {
  completionId: string;
  date: string;
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

const dayForDate = (date: string): WorkingDay | null => {
  const value = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(value.valueOf())) return null;
  return (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[value.getUTCDay()];
};

export function deriveTodayStep(plans: Plan[], date: string): TodayStep | null {
  const day = dayForDate(date);
  if (!day) return null;
  const plan = [...plans]
    .filter(item => item.status === 'active' && item.workingDays?.includes(day))
    .sort(compare)[0];
  if (!plan) return null;
  return {
    completionId: `${date}_${plan.id}_first-proof-v1`,
    date,
    planId: plan.id,
    planTitle: plan.title,
    title: 'Define the first proof of progress',
    description: `Write one observable result that would prove progress toward this outcome: ${plan.outcome} Then name the smallest action you can finish this week.`,
    durationMinutes: Math.max(30, Math.min(60, plan.weeklyHours * 15)),
    targetDate: plan.targetDate
  };
}

export function findNextScheduledDate(plans: Plan[], date: string): string | null {
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.valueOf())) return null;
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = new Date(start);
    candidate.setUTCDate(start.getUTCDate() + offset);
    const candidateDate = candidate.toISOString().slice(0, 10);
    if (deriveTodayStep(plans, candidateDate)) return candidateDate;
  }
  return null;
}
