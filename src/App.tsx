import { firebaseAuthGateway } from './auth/firebaseGateway';
import { useAuth } from './auth/useAuth';
import type { AuthFailure, AuthGateway } from './auth/types';
import { lazyFirebaseWorkspaceGateway } from './workspace/lazyWorkspaceGateway';
import type { WorkspaceGateway } from './workspace/types';
import { useWorkspace } from './workspace/useWorkspace';
import { lazyFirebasePlanGateway } from './plan/lazyPlanGateway';
import {
  PlanScheduleConflictError,
  orderWorkingDays,
  validatePlanDraft,
  validatePlanSchedule,
  workingDays,
  type Plan,
  type PlanDraft,
  type PlanErrors,
  type PlanGateway,
  type PlanScheduleDraft,
  type PlanScheduleErrors,
  type WorkingDay
} from './plan/types';
import { usePlans } from './plan/usePlans';
import { usePlanDetails } from './plan/usePlanDetails';
import { derivePortfolio } from './plan/portfolio';
import { deriveTodayStep, findNextScheduledDate, type TodayStep } from './today/deriveTodayStep';
import { lazyFirebaseTodayGateway } from './today/lazyTodayGateway';
import type { TodayGateway } from './today/types';
import { useTodayCompletion } from './today/useTodayCompletion';
import { useTodayCompletions } from './today/useTodayCompletions';
import { lazyIndexedDbTodayOutbox } from './today/lazyTodayOutbox';
import type { TodayOutbox } from './today/outbox';
import { buildClaraContext, type ClaraGateway, type ClaraPlanScheduleChange } from './clara/types';
import { lazyClaraGateway } from './clara/lazyClaraGateway';
import { lazyClaraApprovalGateway } from './clara/lazyApprovalGateway';
import { ClaraApprovalConflictError, type ClaraApprovalGateway, type ClaraApprovalResult } from './clara/approvalTypes';
import { useClaraRecommendation, type ClaraFailure } from './clara/useClaraRecommendation';
import { formatLongDate } from './date/formatLongDate';
import { buildScheduleRunContext, type ScheduleBlock, type ScheduleRunGateway } from './scheduleRun/types';
import { lazyScheduleRunGateway } from './scheduleRun/lazyGateway';
import { useScheduleRun } from './scheduleRun/useScheduleRun';
import { lazyApprovedDayGateway } from './approvedDay/lazyGateway';
import type { ApprovedDay, ApprovedDayBlock, ApprovedDayGateway } from './approvedDay/types';
import { useApprovedDay } from './approvedDay/useApprovedDay';
import { lazyDayBreakGateway } from './dayBreak/lazyGateway';
import type { DayBreakGateway } from './dayBreak/types';
import { useDayBreak } from './dayBreak/useDayBreak';
import { useEffect, useMemo, useState } from 'react';
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
const dayLabels: Record<WorkingDay, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun'
};
const defaultWorkingDays: WorkingDay[] = ['mon', 'wed', 'fri'];
const createEmptyPlanDraft = (): PlanDraft => ({
  clientRequestId: requestId(), title: '', outcome: '', why: '', targetDate: localDate(), weeklyHours: 5,
  workingDays: [...defaultWorkingDays]
});
const claraFailureCopy: Record<ClaraFailure, [string, string]> = {
  offline: ['You’re offline.', 'Reconnect and try again. Your step and Plan are unchanged.'],
  timeout: ['Clara didn’t respond in time.', 'Longview stopped the request safely. Your step and Plan are unchanged.'],
  malformed: ['Clara’s response could not be used.', 'It did not match the expected format, so nothing was applied.'],
  unavailable: ['Clara is unavailable.', 'Try again shortly. Your step and Plan are unchanged.']
};

function TodayStepCard({ step, completed = false }: { step: TodayStep; completed?: boolean }) {
  return <article className={`plan-card today-card${completed ? ' success' : ''}`}><span className="status">{completed ? `Completed · ${step.planTitle}` : `From ${step.planTitle}`}</span><h2>{step.title}</h2>{!completed && <p>{step.description}</p>}<dl><dt>Time</dt><dd>{step.durationMinutes} minutes</dd><dt>{completed ? 'Completed' : 'Plan target'}</dt><dd>{formatLongDate(completed ? step.date : step.targetDate)}</dd></dl><small>{completed ? 'Your Plan stays active. No new schedule was created.' : 'Prepared from your saved Plan. Nothing was changed.'}</small></article>;
}

function PendingTodayStepCard({ step }: { step: TodayStep }) {
  return <article className="plan-card today-card"><span className="status">Pending completion proof</span><h2>{step.title}</h2><dl><dt>Plan</dt><dd>{step.planTitle}</dd><dt>Saved for</dt><dd>{formatLongDate(step.date)}</dd><dt>Time</dt><dd>{step.durationMinutes} minutes</dd><dt>Completion record</dt><dd>{step.completionId}</dd></dl><small>Your Plan and schedule have not changed.</small></article>;
}

function PendingTodayCompletion({ step, syncStatus, offline, onRetry }: {
  step: TodayStep;
  syncStatus: 'pending' | 'syncing' | 'retry';
  offline: boolean;
  onRetry: () => void;
}) {
  if (syncStatus === 'syncing') return <div className="today-content" aria-busy="true"><h1>Syncing your completion</h1><p>Longview is checking that your progress is safely saved to your workspace.</p><PendingTodayStepCard step={step} /><div className="clara-progress" role="progressbar" aria-label="Syncing completion" aria-valuetext="Checking your saved completion"><span /></div><small>Your saved copy stays on this device until the workspace confirms it.</small></div>;
  const failed = syncStatus === 'retry';
  return <div className="today-content"><h1>{failed ? 'Still waiting to sync' : 'Saved on this device'}</h1><p>{failed ? 'Your completion is safe here, but Longview could not add it to your workspace yet.' : 'Your completion is safe here. Longview will add it to your workspace when you’re back online.'}</p><PendingTodayStepCard step={step} /><div className="notice" role="status"><strong>{failed ? 'Sync needs another try' : 'Waiting to sync'}</strong><p>{failed ? 'Nothing was duplicated or lost.' : 'You can leave this screen. Keep this browser’s data until syncing finishes.'}</p></div>{failed && <button onClick={onRetry} disabled={offline}>{offline ? 'Reconnect to try again' : 'Try sync again'}</button>}</div>;
}

function ClaraPanel({ clara, onClose, onReview }: {
  clara: ReturnType<typeof useClaraRecommendation>;
  onClose: () => void;
  onReview: (proposal: ClaraPlanScheduleChange) => void;
}) {
  const { snapshot } = clara;
  if (snapshot.status === 'loading') return <aside className="plan-card clara-card clara-loading" aria-busy="true"><span className="status">Clara · read only</span><h2>Clara is reviewing this step…</h2><p>Using only this Plan and today’s step to prepare a recommendation.</p><div className="clara-progress" role="progressbar" aria-label="Waiting for Clara" aria-valuetext="Clara is preparing a recommendation"><span /></div><small>This usually takes a few seconds.</small><button className="secondary" onClick={onClose}>Cancel and return</button></aside>;
  if (snapshot.status === 'error') {
    const [title, detail] = claraFailureCopy[snapshot.failure];
    return <aside className="plan-card clara-card" role="alert"><span className="status">Nothing changed</span><h2>{title}</h2><p>{detail}</p><div className="actions"><button onClick={clara.retry}>Try again</button><button className="secondary" onClick={onClose}>Close</button></div></aside>;
  }
  if (snapshot.status === 'ready') return <aside className="plan-card clara-card"><span className="status">Read-only recommendation · {snapshot.recommendation.confidence} confidence</span><h2>{snapshot.recommendation.headline}</h2><p>{snapshot.recommendation.recommendation}</p><p><strong>Why:</strong> {snapshot.recommendation.rationale}</p><dl>{snapshot.recommendation.sourceFacts.map(fact => <div key={fact}><dt>Context used</dt><dd>{fact}</dd></div>)}</dl><small>{snapshot.recommendation.proposedChange ? 'A specific schedule change is ready for review. Nothing has changed yet.' : 'Recommendation only · Nothing was changed.'}</small>{snapshot.recommendation.proposedChange && <button onClick={() => onReview(snapshot.recommendation.proposedChange!)}>Review schedule change</button>}<button className="secondary" onClick={onClose}>Close recommendation</button></aside>;
  return null;
}

type ApprovalState =
  | { status: 'review'; result: null; failure: null }
  | { status: 'applying'; result: null; failure: null }
  | { status: 'success'; result: ClaraApprovalResult; failure: null }
  | { status: 'error'; result: null; failure: 'conflict' | 'unavailable' };

function ClaraApprovalPanel({ proposal, state, onApprove, onReject, onReturn }: {
  proposal: ClaraPlanScheduleChange;
  state: ApprovalState;
  onApprove: () => void;
  onReject: () => void;
  onReturn: () => void;
}) {
  const labels = (days: WorkingDay[]) => orderWorkingDays(days).map(day => dayLabels[day]).join(', ');
  if (state.status === 'success') return <aside className="plan-card clara-card success"><span className="status">Applied once</span><h2>Schedule change approved</h2><p>Working days are now {labels(state.result.workingDays)}. Weekly time remains {state.result.weeklyHours} hours.</p><dl><div><dt>Approval record</dt><dd>{state.result.auditEventId}</dd></div><div><dt>Schedule version</dt><dd>{proposal.expectedScheduleVersion} → {state.result.scheduleVersion}</dd></div></dl><small>{state.result.duplicate ? 'The original result was returned. No duplicate write was created.' : 'The Plan update and approval record were saved together.'}</small><button onClick={onReturn}>View updated Today</button></aside>;
  if (state.status === 'error') return <aside className="plan-card clara-card" role="alert"><span className="status">Nothing changed</span><h2>{state.failure === 'conflict' ? 'This preview is out of date.' : 'The schedule change wasn’t saved.'}</h2><p>{state.failure === 'conflict' ? 'The Plan changed after Clara prepared this preview. Reload before reviewing another proposal.' : 'Check the connection and retry the same approval. The existing Plan is unchanged.'}</p><div className="actions">{state.failure === 'unavailable' && <button onClick={onApprove}>Try approval again</button>}<button className="secondary" onClick={onReturn}>{state.failure === 'conflict' ? 'Reload Today' : 'Return without changes'}</button></div></aside>;
  return <aside className="plan-card clara-card" aria-busy={state.status === 'applying'}><span className="status">Review Clara’s change</span><h2>Nothing changes until you approve it.</h2><div className="approval-diff"><div><small>Before</small><strong>{labels(proposal.workingDaysBefore)}</strong><span>{proposal.weeklyHours} hours/week · version {proposal.expectedScheduleVersion}</span></div><div><small>After</small><strong>{labels(proposal.workingDaysAfter)}</strong><span>{proposal.weeklyHours} hours/week · no allocation change</span></div></div><p><strong>Why:</strong> {proposal.rationale}</p><p><strong>Effect:</strong> {proposal.downstreamEffect}</p><div className="actions"><button onClick={onApprove} disabled={state.status === 'applying'}>{state.status === 'applying' ? 'Applying approved change…' : 'Approve schedule change'}</button><button className="secondary" onClick={onReject} disabled={state.status === 'applying'}>Reject and keep current schedule</button></div></aside>;
}

function DayBlocks({ blocks }: { blocks: ScheduleBlock[] | ApprovedDayBlock[] }) {
  return <div className="schedule-blocks">{blocks.map((block, index) => <article className="plan-card" key={`${block.planId}-${index}`}><span className="status">{index === 0 ? 'First' : `Then · ${index + 1}`}</span><h2>{block.title}</h2><p>{block.planTitle}</p><small>{block.durationMinutes} minutes</small></article>)}</div>;
}

function ApprovedDayView({ day, capacityMinutes, duplicate, onCapacity, onPrepare, onBreak, onReturn }: {
  day: ApprovedDay;
  capacityMinutes: number;
  duplicate: boolean;
  onCapacity: (minutes: number) => void;
  onPrepare: () => void;
  onBreak: () => void;
  onReturn: () => void;
}) {
  return <section className="calendar-view"><span className="status">Approved day · revision {day.revision}</span><h1>{formatLongDate(day.selectedDate)} is ready.</h1><p>{day.totalMinutes} of {day.capacityMinutes} minutes are approved in this order.</p><DayBlocks blocks={day.blocks} /><div className="notice"><strong>{duplicate ? 'This approval was already saved.' : 'Only this day was updated.'}</strong><p>{duplicate ? 'The original result was returned; no duplicate revision or audit record was created.' : 'Future days and Plan schedules remain unchanged.'}</p></div><dl><div><dt>Source run</dt><dd>{day.sourceRunId}</dd></div><div><dt>Approval record</dt><dd>{day.approvalEventId}</dd></div></dl><label>Planning window for a replacement<input type="number" min="30" max="480" step="15" value={capacityMinutes} onChange={event => onCapacity(Number(event.target.value))} /></label><div className="actions"><button onClick={onPrepare} disabled={capacityMinutes < 30 || capacityMinutes > 480}>Prepare replacement</button><button className="secondary" onClick={onBreak}>Take a break today</button><button className="secondary" onClick={onReturn}>Return to Today</button></div></section>;
}

function BreakDayView({ day, onReturn }: { day: ApprovedDay; onReturn: () => void }) {
  return <section className="calendar-view"><span className="status">Day break · revision {day.revision}</span><h1>{formatLongDate(day.selectedDate)} is marked as a break.</h1><p>Nothing was marked complete. {day.carryoverCount === 1 ? 'One unfinished task is waiting for its next eligible Plan day.' : `${day.carryoverCount} unfinished tasks are waiting for their next eligible Plan days.`}</p><div className="notice"><strong>Future days still need your approval.</strong><p>Carried tasks join their destination day’s next proposal; no reviewed order was overwritten.</p></div><dl><div><dt>Source approval</dt><dd>{day.approvalEventId}</dd></div><div><dt>Break record</dt><dd>{day.breakEventId}</dd></div></dl><button onClick={onReturn}>Return to Today</button></section>;
}

function DayBreakPanel({ dayBreak, day, onCancel, onReload, onReviewPlans, onReturn }: {
  dayBreak: ReturnType<typeof useDayBreak>;
  day: ApprovedDay;
  onCancel: () => void;
  onReload: () => void;
  onReviewPlans: () => void;
  onReturn: () => void;
}) {
  const { snapshot } = dayBreak;
  if (snapshot.status === 'loading') return <section className="calendar-view" aria-busy="true"><span className="status">Reviewing today’s break</span><h1>Finding each task’s next eligible day.</h1><p>Today’s approved order remains unchanged while Longview checks current Plan schedules.</p><div className="clara-progress" role="progressbar" aria-label="Preparing day break"><span /></div></section>;
  if (snapshot.status === 'review') return <section className="calendar-view"><span className="status">Review day break</span><h1>{snapshot.preview.carryovers.length} unfinished {snapshot.preview.carryovers.length === 1 ? 'task will' : 'tasks will'} carry forward.</h1><p>Nothing will be marked complete.</p><div className="schedule-blocks">{snapshot.preview.carryovers.map(value => <article className="plan-card" key={`${value.planId}-${value.order}`}><span className="status">{formatLongDate(value.destinationDate)}</span><h2>{value.title}</h2><p>Next eligible day for {value.planTitle}</p><small>{value.durationMinutes} minutes</small></article>)}</div><div className="notice"><strong>Future days will not be approved or overwritten.</strong><p>Each task joins its destination day’s next proposal. You will still review that day.</p></div><div className="actions"><button onClick={dayBreak.confirm}>Confirm break and carry tasks</button><button className="secondary" onClick={onCancel}>Keep today’s approved order</button></div></section>;
  if (snapshot.status === 'applying') return <section className="calendar-view" aria-busy="true"><span className="status">Saving today’s break</span><h1>Carrying the tasks you reviewed.</h1><p>Today’s approved order stays available until every change succeeds together.</p><div className="clara-progress" role="progressbar" aria-label="Saving day break" aria-valuetext="Break confirmation in progress"><span /></div></section>;
  if (snapshot.status === 'success') return <section className="calendar-view"><span className="status">Break saved · revision {snapshot.result.breakDay.revision}</span><h1>{formatLongDate(snapshot.result.breakDay.selectedDate)} is marked as a break.</h1><p>Nothing was marked complete.</p><div className="schedule-blocks">{snapshot.result.carryovers.map(value => <article className="plan-card" key={`${value.planId}-${value.order}`}><span className="status">{formatLongDate(value.destinationDate)}</span><h2>{value.title}</h2><p>Will join the next proposal for {value.planTitle}</p></article>)}</div><div className="notice"><strong>{snapshot.result.duplicate ? 'This break was already saved.' : 'No future day was approved or overwritten.'}</strong><p>{snapshot.result.duplicate ? 'The original result was returned; no duplicate carryover was created.' : 'Review and approve each destination day when it arrives.'}</p></div><dl><div><dt>Break record</dt><dd>{snapshot.result.breakDay.breakEventId}</dd></div><div><dt>Pending carryovers</dt><dd>{snapshot.result.carryovers.length}</dd></div></dl><button onClick={onReturn}>Return to Today</button></section>;
  const copy = snapshot.failure === 'future-approved'
    ? ['No future day was overwritten.', 'One destination already has an approved order. Today and every future day remain unchanged.']
    : snapshot.failure === 'no-eligible-day'
      ? ['One task has no eligible future day.', 'Review that Plan’s working days before taking this break. Nothing moved.']
      : snapshot.failure === 'source-changed'
        ? ['This break preview is out of date.', 'Today or a Plan schedule changed after the preview. Nothing moved.']
        : ['The break was not saved.', 'Today’s approved order is still available. No future day changed.'];
  return <section className="calendar-view" role="alert"><span className="status">Nothing changed</span><h1>{copy[0]}</h1><p>{copy[1]}</p><div className="actions">{snapshot.failure === 'unavailable' && snapshot.preview ? <button onClick={dayBreak.retry}>Try again</button> : snapshot.failure === 'unavailable' ? <button onClick={() => dayBreak.preview(day)}>Try again</button> : snapshot.failure === 'source-changed' ? <button onClick={onReload}>Review latest day</button> : snapshot.failure === 'no-eligible-day' ? <button onClick={onReviewPlans}>Review Plan schedules</button> : null}<button className="secondary" onClick={onCancel}>Keep today’s order</button></div></section>;
}

function ScheduleRunPanel({ scheduleRun, approvedDay, dayBreak, capacityMinutes, eligibleCount, scheduledCount, planCount, preparationStatus, onCapacity, onStart, onReset, onReturn, onCreatePlan, onReviewPlans, onRetryPreparation }: {
  scheduleRun: ReturnType<typeof useScheduleRun>;
  approvedDay: ReturnType<typeof useApprovedDay>;
  dayBreak: ReturnType<typeof useDayBreak>;
  capacityMinutes: number;
  eligibleCount: number;
  scheduledCount: number;
  planCount: number;
  preparationStatus: 'loading' | 'ready' | 'error';
  onCapacity: (minutes: number) => void;
  onStart: (retryOf?: string) => void;
  onReset: () => void;
  onReturn: () => void;
  onCreatePlan: () => void;
  onReviewPlans: () => void;
  onRetryPreparation: () => void;
}) {
  const { snapshot } = scheduleRun;
  if (snapshot.status === 'idle' && preparationStatus === 'loading') return <section className="calendar-view" aria-busy="true"><span className="status">Calendar · Today</span><h1>Checking today’s progress…</h1><p>Longview is confirming which scheduled steps are still unfinished.</p><div className="clara-progress" role="progressbar" aria-label="Checking today’s completed steps"><span /></div></section>;
  if (snapshot.status === 'idle' && preparationStatus === 'error') return <section className="calendar-view" role="alert"><span className="status">Nothing changed</span><h1>Today’s progress could not be checked.</h1><p>Longview will not prepare a proposal until completed steps can be excluded safely.</p><button onClick={onRetryPreparation}>Try again</button></section>;
  if (snapshot.status === 'idle' && eligibleCount === 0 && scheduledCount > 0) return <section className="calendar-view"><span className="status">Calendar · Today complete</span><h1>You’re done for today.</h1><p>Every step scheduled for today has already been completed. You can stop here, review your Plans, or create another Plan when you’re ready.</p><div className="actions"><button onClick={onReturn}>Return to Today</button><button className="secondary" onClick={onReviewPlans}>Review your Plans</button><button className="secondary" onClick={onCreatePlan}>Create another Plan</button></div><small>No completed step was included in a proposal.</small></section>;
  if (snapshot.status === 'idle' && eligibleCount === 0) return <section className="calendar-view"><span className="status">Calendar · Today</span><h1>Nothing is planned for today.</h1><p>{planCount === 0 ? 'Create your first Plan and choose the days you want to work on it.' : 'Review your Plan schedules to add today as a working day, or create another Plan.'}</p><div className="actions">{planCount > 0 && <button onClick={onReviewPlans}>Review Plan schedules</button>}<button className={planCount > 0 ? 'secondary' : ''} onClick={onCreatePlan}>{planCount > 0 ? 'Create another Plan' : 'Create a Plan'}</button></div><small>No empty run was started. Your saved Plans are unchanged.</small></section>;
  if (snapshot.status === 'idle' && (approvedDay.snapshot.status === 'idle' || approvedDay.snapshot.status === 'loading')) return <section className="calendar-view" aria-busy="true"><span className="status">Calendar · Today</span><h1>Loading your approved day…</h1><p>Longview is checking whether today already has a saved order.</p><div className="clara-progress" role="progressbar" aria-label="Loading approved day"><span /></div></section>;
  if (snapshot.status === 'idle' && approvedDay.snapshot.status === 'error') return <section className="calendar-view" role="alert"><span className="status">Nothing changed</span><h1>Your approved day could not be checked.</h1><p>Longview will not prepare a replacement until the latest saved revision is known.</p><button onClick={approvedDay.reload}>Try again</button></section>;
  if (approvedDay.approval.status === 'applying') return <section className="calendar-view" aria-busy="true"><span className="status">Approving today</span><h1>Saving the order you reviewed.</h1><p>Keep this page open. Your current approved day remains available until the transaction finishes.</p><div className="clara-progress" role="progressbar" aria-label="Saving approved day" aria-valuetext="Approval in progress"><span /></div></section>;
  if (approvedDay.approval.status === 'error') {
    const conflict = approvedDay.approval.failure === 'conflict';
    return <section className="calendar-view" role="alert"><span className="status">Nothing changed</span><h1>{conflict ? 'This proposal is out of date.' : 'Today was not changed.'}</h1><p>{conflict ? 'The approved day changed after this proposal was prepared. Review the latest day before preparing another replacement.' : 'Longview could not save this order. Your previously approved day is still available.'}</p><div className="actions">{conflict ? <button onClick={() => { onReset(); void approvedDay.reload(); }}>Review latest day</button> : <button onClick={approvedDay.retryApproval}>Try approval again</button>}<button className="secondary" onClick={onReset}>Keep approved day</button></div></section>;
  }
  const currentDay = approvedDay.approval.status === 'success' ? approvedDay.approval.result.approvedDay : approvedDay.snapshot.day;
  if (currentDay && dayBreak.snapshot.status !== 'idle') return <DayBreakPanel dayBreak={dayBreak} day={currentDay} onCancel={dayBreak.reset} onReload={() => { dayBreak.reset(); onReset(); void approvedDay.reload(); }} onReviewPlans={onReviewPlans} onReturn={onReturn} />;
  if (snapshot.status === 'idle' && currentDay?.status === 'break') return <BreakDayView day={currentDay} onReturn={onReturn} />;
  if (approvedDay.approval.status === 'success') {
    const result = approvedDay.approval.result;
    return <ApprovedDayView day={result.approvedDay} capacityMinutes={capacityMinutes} duplicate={result.duplicate} onCapacity={onCapacity} onPrepare={() => onStart()} onBreak={() => void dayBreak.preview(result.approvedDay)} onReturn={onReturn} />;
  }
  if (snapshot.status === 'idle' && approvedDay.snapshot.status === 'ready' && approvedDay.snapshot.day) return <ApprovedDayView day={approvedDay.snapshot.day} capacityMinutes={capacityMinutes} duplicate={false} onCapacity={onCapacity} onPrepare={() => onStart()} onBreak={() => void dayBreak.preview(approvedDay.snapshot.day!)} onReturn={onReturn} />;
  if (snapshot.status === 'idle') return <section className="calendar-view"><span className="status">Calendar · Today</span><h1>Prepare today across your Plans.</h1><p>Longview can order today’s eligible steps inside a planning window. You’ll review a proposal only—nothing is saved or replaced.</p><label>Planning window in minutes<input type="number" min="30" max="480" step="15" value={capacityMinutes} onChange={event => onCapacity(Number(event.target.value))} /></label><small>{eligibleCount} eligible {eligibleCount === 1 ? 'Plan' : 'Plans'} for {formatLongDate(localDate())}.</small><button onClick={() => onStart()} disabled={capacityMinutes < 30 || capacityMinutes > 480}>Prepare today</button></section>;
  if (snapshot.status === 'starting' || snapshot.status === 'active') {
    const checkpoint = snapshot.run?.checkpoint ?? 1;
    const label = snapshot.run?.checkpointLabel ?? 'Creating run';
    return <section className="calendar-view" aria-busy="true"><span className="status">Preparing today</span><h1>Your proposal is being prepared.</h1><p>Longview is checking only today’s eligible Plans and your {capacityMinutes}-minute planning window.</p><div className="run-meta"><strong>{label}</strong><small>{snapshot.run ? `Run ${snapshot.run.runId}` : 'Creating a secure run…'}</small></div><div className="clara-progress" role="progressbar" aria-label="Preparing today" aria-valuetext={`${label}. Checkpoint ${checkpoint} of 4.`}><span /></div><ol className="checkpoint-list">{['Run queued', 'Context validated', 'Proposal generated', 'Result published'].map((item, index) => <li key={item} className={index + 1 <= checkpoint ? 'complete' : ''}>{item}</li>)}</ol>{snapshot.run && <button className="secondary" onClick={scheduleRun.cancel}>Cancel run</button>}</section>;
  }
  if (snapshot.status === 'succeeded') {
    const replacing = Boolean(approvedDay.snapshot.day);
    return <section className="calendar-view"><span className="status">Review proposal</span><h1>A workable order for today.</h1><p>{snapshot.run.proposal!.rationale}</p><DayBlocks blocks={snapshot.run.proposal!.blocks} /><div className="notice"><strong>{replacing ? 'Your approved day is still unchanged.' : 'Nothing has been saved yet.'}</strong><p>{replacing ? `Approving will replace revision ${approvedDay.snapshot.day!.revision} only after this explicit confirmation.` : 'This proposal becomes durable only after you approve this exact order.'}</p></div><div className="actions"><button onClick={() => void approvedDay.approve(snapshot.run)}>{replacing ? 'Replace approved day' : 'Approve this order'}</button><button className="secondary" onClick={onReset}>Adjust planning window</button><button className="secondary" onClick={() => onStart(snapshot.run.runId)}>Prepare a new proposal</button><button className="secondary" onClick={onReturn}>Return to Today</button></div></section>;
  }
  if (snapshot.status === 'cancelled') return <section className="calendar-view"><span className="status">Run cancelled</span><h1>Your schedule stayed as it was.</h1><p>No proposal was published, and no Plan was changed.</p><div className="actions"><button onClick={() => onStart(snapshot.run.runId)}>Start a new run</button><button className="secondary" onClick={onReturn}>Return to Today</button></div></section>;
  const run = snapshot.run;
  const timedOut = snapshot.status === 'timed-out';
  return <section className="calendar-view" role="alert"><span className="status">Nothing changed</span><h1>{timedOut ? 'The run took too long.' : 'Today could not be prepared.'}</h1><p>{snapshot.status === 'error' && snapshot.failure === 'offline' ? 'Reconnect and try again.' : run?.failure ?? 'The local Clara service could not complete this request.'} Your Plans are unchanged.</p><div className="actions"><button onClick={() => onStart(run?.runId)}>Start a new run</button><button className="secondary" onClick={onReturn}>Return to Today</button></div></section>;
}

function WorkspaceReady({ auth, gateway, planGateway, todayGateway, todayOutbox, claraGateway, claraApprovalGateway, scheduleRunGateway, approvedDayGateway, dayBreakGateway }: {
  auth: ReturnType<typeof useAuth>;
  gateway: WorkspaceGateway;
  planGateway: PlanGateway;
  todayGateway: TodayGateway;
  todayOutbox: TodayOutbox;
  claraGateway: ClaraGateway;
  claraApprovalGateway: ClaraApprovalGateway;
  scheduleRunGateway: ScheduleRunGateway;
  approvedDayGateway: ApprovedDayGateway;
  dayBreakGateway: DayBreakGateway;
}) {
  const snapshot = auth.snapshot;
  if (snapshot.status !== 'authenticated') return null;
  const workspace = useWorkspace(snapshot.user, gateway);
  const [stage, setStage] = useState<'workspace' | 'today' | 'plan-create' | 'plan-review' | 'plan-saved' | 'plan-details' | 'plan-schedule'>(() =>
    localStorage.getItem('longview:onboarding') === 'complete' ? 'today' : 'workspace'
  );
  const [view, setView] = useState<'today' | 'calendar' | 'plans' | 'settings'>('today');
  const [planningWindow, setPlanningWindow] = useState(120);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [showClara, setShowClara] = useState(false);
  const [approvalProposal, setApprovalProposal] = useState<ClaraPlanScheduleChange | null>(null);
  const [approvalKey, setApprovalKey] = useState('');
  const [approvalState, setApprovalState] = useState<ApprovalState>({ status: 'review', result: null, failure: null });
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [detailsContext, setDetailsContext] = useState<'history' | 'decisions' | 'research' | 'brief' | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<PlanScheduleDraft>({ workingDays: defaultWorkingDays, weeklyHours: 5 });
  const [scheduleErrors, setScheduleErrors] = useState<PlanScheduleErrors>({});
  const [scheduleFailure, setScheduleFailure] = useState<'conflict' | 'unavailable' | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [planDraft, setPlanDraft] = useState<PlanDraft>(createEmptyPlanDraft);
  const [planErrors, setPlanErrors] = useState<PlanErrors>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSaveFailed, setPlanSaveFailed] = useState(false);
  const plans = usePlans(snapshot.user, planGateway, (stage === 'today' && view !== 'settings') || stage === 'plan-details' || stage === 'plan-schedule');
  const planDetails = usePlanDetails(snapshot.user, planGateway, selectedPlanId, stage === 'plan-details' || stage === 'plan-schedule');
  const todayStep = useMemo(() => deriveTodayStep(plans.snapshot.plans, localDate()), [plans.snapshot.plans]);
  const nextScheduledDate = useMemo(() => findNextScheduledDate(plans.snapshot.plans, localDate()), [plans.snapshot.plans]);
  const selectedDetailsPlan = planDetails.snapshot.status === 'ready' ? planDetails.snapshot.plan : null;
  const selectedDetailsStep = useMemo(() => selectedDetailsPlan ? deriveTodayStep([selectedDetailsPlan], localDate()) : null, [selectedDetailsPlan]);
  const selectedDetailsNextDate = useMemo(() => selectedDetailsPlan ? findNextScheduledDate([selectedDetailsPlan], localDate()) : null, [selectedDetailsPlan]);
  const portfolio = useMemo(() => derivePortfolio(plans.snapshot.plans), [plans.snapshot.plans]);
  const calendarSteps = useMemo(
    () => portfolio.entries.map(entry => deriveTodayStep([entry.plan], localDate())).filter((step): step is TodayStep => Boolean(step)),
    [portfolio.entries]
  );
  const selectedPlan = useMemo(() => plans.snapshot.plans.find(plan => plan.id === todayStep?.planId) ?? null, [plans.snapshot.plans, todayStep?.planId]);
  const calendarCompletions = useTodayCompletions(snapshot.user, calendarSteps, todayGateway, stage === 'today' && view === 'calendar' && plans.snapshot.status === 'ready');
  const completedCalendarStepIds = calendarCompletions.snapshot.status === 'ready'
    ? calendarCompletions.snapshot.completedStepIds
    : new Set<string>();
  const scheduleRunContext = useMemo(
    () => calendarCompletions.snapshot.status === 'ready'
      ? buildScheduleRunContext(portfolio.entries, localDate(), planningWindow, requestId(), null, completedCalendarStepIds)
      : null,
    [calendarCompletions.snapshot.status, completedCalendarStepIds, planningWindow, portfolio.entries]
  );
  const calendarPreparationStatus = plans.snapshot.status === 'error' || calendarCompletions.snapshot.status === 'error'
    ? 'error' as const
    : plans.snapshot.status !== 'ready' || calendarCompletions.snapshot.status !== 'ready'
      ? 'loading' as const
      : 'ready' as const;
  const approvedDay = useApprovedDay(
    approvedDayGateway,
    localDate(),
    stage === 'today' && (view === 'today' || view === 'calendar')
  );
  const todayBreakDay = approvedDay.snapshot.status === 'ready' && approvedDay.snapshot.day?.status === 'break'
    ? approvedDay.snapshot.day
    : null;
  const completion = useTodayCompletion(
    snapshot.user,
    todayStep,
    todayGateway,
    todayOutbox,
    stage === 'today' && view === 'today' && plans.snapshot.status === 'ready' && approvedDay.snapshot.status === 'ready' && !todayBreakDay
  );
  const clara = useClaraRecommendation(claraGateway);
  const scheduleRun = useScheduleRun(scheduleRunGateway);
  const dayBreak = useDayBreak(dayBreakGateway);

  const startScheduleRun = (retryOf?: string) => {
    if (calendarCompletions.snapshot.status !== 'ready') return;
    const context = buildScheduleRunContext(portfolio.entries, localDate(), planningWindow, requestId(), retryOf ?? null, completedCalendarStepIds);
    if (context) {
      approvedDay.resetApproval();
      void scheduleRun.start(context);
    }
  };

  const resetCalendarProposal = () => {
    scheduleRun.reset();
    approvedDay.resetApproval();
    dayBreak.reset();
  };

  useEffect(() => {
    setShowClara(false);
    clara.cancel();
  }, [clara.cancel, todayStep?.completionId, view]);

  const askClara = () => {
    if (!selectedPlan || !todayStep) return;
    setShowClara(true);
    void clara.ask(buildClaraContext(selectedPlan, todayStep, requestId()));
  };

  const reviewClaraChange = (proposal: ClaraPlanScheduleChange) => {
    setApprovalProposal(proposal);
    setApprovalKey(requestId());
    setApprovalState({ status: 'review', result: null, failure: null });
  };

  const applyClaraChange = async () => {
    if (!approvalProposal || !approvalKey) return;
    setApprovalState({ status: 'applying', result: null, failure: null });
    try {
      const result = await claraApprovalGateway.apply(approvalProposal, approvalKey);
      setApprovalState({ status: 'success', result, failure: null });
      plans.retry();
    } catch (error) {
      setApprovalState({
        status: 'error', result: null,
        failure: error instanceof ClaraApprovalConflictError ? 'conflict' : 'unavailable'
      });
    }
  };

  const closeClaraApproval = () => {
    setApprovalProposal(null);
    setApprovalKey('');
    setApprovalState({ status: 'review', result: null, failure: null });
    setShowClara(false);
    plans.retry();
  };

  const updatePlan = (field: keyof PlanDraft, value: string | number) => {
    setPlanDraft(current => ({ ...current, [field]: value }));
    setPlanErrors(current => ({ ...current, [field]: undefined }));
  };

  const startNewPlan = () => {
    setPlanDraft(createEmptyPlanDraft());
    setPlanErrors({});
    setPlanSaveFailed(false);
    setStage('plan-create');
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

  const continueSetup = () => {
    localStorage.setItem('longview:onboarding', 'complete');
    setStage('today');
  };

  const openPlanDetails = (plan: Plan) => {
    setSelectedPlanId(plan.id);
    setDetailsContext(null);
    setStage('plan-details');
  };

  const openPlanSchedule = (plan: Plan) => {
    setSelectedPlanId(plan.id);
    setScheduleDraft({
      workingDays: plan.workingDays ? [...plan.workingDays] : [...defaultWorkingDays],
      weeklyHours: plan.weeklyHours
    });
    setScheduleErrors({});
    setScheduleFailure(null);
    setStage('plan-schedule');
  };

  const savePlanSchedule = async () => {
    if (!selectedDetailsPlan || savingSchedule) return;
    const errors = validatePlanSchedule(scheduleDraft);
    setScheduleErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSavingSchedule(true);
    setScheduleFailure(null);
    try {
      const updated = await planGateway.updateSchedule(
        snapshot.user,
        selectedDetailsPlan.id,
        scheduleDraft,
        selectedDetailsPlan.scheduleVersion ?? 0
      );
      plans.replace(updated);
      planDetails.replace(updated);
      setStage('plan-details');
    } catch (error) {
      setScheduleFailure(error instanceof PlanScheduleConflictError ? 'conflict' : 'unavailable');
    } finally {
      setSavingSchedule(false);
    }
  };

  const clearLocalData = async () => {
    await todayOutbox.clearOwner(snapshot.user.uid);
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

  if (stage === 'plan-details') {
    const detailSnapshot = planDetails.snapshot;
    if (detailSnapshot.status !== 'ready') {
      if (detailSnapshot.status === 'idle' || detailSnapshot.status === 'loading') return <main className="shell" aria-busy="true"><p className="eyebrow">Longview</p><section className="card"><span className="status">Plan details</span><h1>Loading this Plan…</h1><p>Reading the latest owner-approved version.</p></section></main>;
      if (detailSnapshot.status === 'missing') return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Plan unavailable</span><h1>This Plan is no longer available.</h1><p>No old details are shown. Return to Plans to load the latest portfolio.</p><button onClick={() => { setStage('today'); setView('plans'); plans.retry(); }}>Return to Plans</button></section></main>;
      return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Plan details unavailable</span><h1>Couldn’t load this Plan.</h1><p>The saved Plan is unchanged. Check your connection and retry the same Plan.</p><div className="actions"><button onClick={planDetails.retry}>Try again</button><button className="secondary" onClick={() => { setStage('today'); setView('plans'); }}>Return to Plans</button></div></section></main>;
    }
    const plan = detailSnapshot.plan;
    const mode = portfolio.entries.find(entry => entry.plan.id === plan.id)?.mode ?? 'Focus';
    const contextCopy = detailsContext ? {
      history: ['Execution history', 'No completed work has been recorded for this Plan yet.'],
      decisions: ['Decisions', 'No decisions have been recorded for this Plan yet.'],
      research: ['Research', 'No reviewed research has been saved for this Plan yet.'],
      brief: ['Plan brief', 'No Plan brief has been created yet.']
    }[detailsContext] : null;
    return <main className="app-shell plan-details-shell"><header><p className="eyebrow">Longview</p><button className="secondary compact" onClick={() => { setStage('today'); setView('plans'); }}>Back to Plans</button></header><section className="plan-details-view"><span className="status">Plan details · {mode}</span><h1>{plan.title}</h1><p className="lead">{plan.outcome}</p><div className="detail-grid"><article className="plan-card"><h2>Plan overview</h2><dl><dt>Why it matters</dt><dd>{plan.why}</dd><dt>Target date</dt><dd>{formatLongDate(plan.targetDate)}</dd><dt>Weekly time</dt><dd>{plan.weeklyHours} hours</dd><dt>Working days</dt><dd>{plan.workingDays ? orderWorkingDays(plan.workingDays).map(day => dayLabels[day]).join(', ') : 'Schedule not set'}</dd></dl><button onClick={() => openPlanSchedule(plan)}>{plan.workingDays ? 'Edit schedule' : 'Add schedule'}</button></article><article className="plan-card"><span className="status">Current step</span>{selectedDetailsStep ? <><h2>{selectedDetailsStep.title}</h2><p>{selectedDetailsStep.description}</p><small>{selectedDetailsStep.durationMinutes} minutes · scheduled today</small><button onClick={() => { setStage('today'); setView('today'); }}>Open Today</button></> : <><h2>Nothing scheduled today.</h2><p>{plan.workingDays ? selectedDetailsNextDate ? `This Plan returns ${formatLongDate(selectedDetailsNextDate)}.` : 'No upcoming working day is available.' : 'Add working days in Plan overview before this Plan can appear in Today.'}</p></>}</article></div><section className="detail-section"><div><span className="status">Plan context</span><h2>Keep the reasoning with the work.</h2><p>These sections stay scoped to this Plan. Empty sections do not invent activity.</p></div><div className="context-grid"><button className="secondary" onClick={() => setDetailsContext('history')}>Execution history</button><button className="secondary" onClick={() => setDetailsContext('decisions')}>Decisions</button><button className="secondary" onClick={() => setDetailsContext('research')}>Research</button><button className="secondary" onClick={() => setDetailsContext('brief')}>Plan brief</button></div>{contextCopy && <div className="notice"><strong>{contextCopy[0]}</strong><p>{contextCopy[1]}</p><button className="secondary compact" onClick={() => setDetailsContext(null)}>Close</button></div>}</section></section></main>;
  }

  if (stage === 'plan-schedule') {
    if (!selectedDetailsPlan) return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><h1>This Plan could not be found.</h1><button onClick={() => { setStage('today'); setView('plans'); plans.retry(); }}>Return to Plans</button></section></main>;
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Plan schedule</span><h1>When will you work on {selectedDetailsPlan.title}?</h1><p>Choose working days and a weekly allocation. Clock times can be added later.</p><fieldset><legend>Working days</legend><div className="day-choices">{workingDays.map(day => <button type="button" key={day} aria-pressed={scheduleDraft.workingDays.includes(day)} className={scheduleDraft.workingDays.includes(day) ? '' : 'secondary'} onClick={() => { setScheduleDraft(current => ({ ...current, workingDays: current.workingDays.includes(day) ? current.workingDays.filter(value => value !== day) : [...current.workingDays, day] })); setScheduleErrors(current => ({ ...current, workingDays: undefined })); }}>{dayLabels[day]}</button>)}</div></fieldset>{scheduleErrors.workingDays && <small role="alert">{scheduleErrors.workingDays}</small>}<label>Hours for this Plan each week<input type="number" min="1" max="40" value={scheduleDraft.weeklyHours} onChange={event => { setScheduleDraft(current => ({ ...current, weeklyHours: Number(event.target.value) })); setScheduleErrors(current => ({ ...current, weeklyHours: undefined })); }} /></label>{scheduleErrors.weeklyHours && <small role="alert">{scheduleErrors.weeklyHours}</small>}{scheduleFailure === 'unavailable' && <div className="notice" role="alert">The schedule wasn’t saved. The existing Plan is unchanged. Check your connection and try again.</div>}{scheduleFailure === 'conflict' && <div className="notice" role="alert">This Plan was updated in another session. Your changes weren’t saved. Reload the Plan before editing again.<button onClick={() => { planDetails.retry(); setStage('plan-details'); }}>Reload Plan</button></div>}<div className="actions"><button onClick={savePlanSchedule} disabled={savingSchedule}>{savingSchedule ? 'Saving schedule…' : 'Save schedule'}</button><button className="secondary" onClick={() => setStage('plan-details')} disabled={savingSchedule}>Cancel</button></div></section></main>;
  }

  if (stage === 'plan-create') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Create a Plan</span><h1>What do you want to make progress on?</h1><p>Start with one meaningful outcome. You can refine it later.</p><form onSubmit={event => { event.preventDefault(); reviewPlan(); }} noValidate>
      <label>Plan title<input value={planDraft.title} maxLength={80} onChange={event => updatePlan('title', event.target.value)} aria-describedby={planErrors.title ? 'title-error' : undefined} /></label>{planErrors.title && <small id="title-error" role="alert">{planErrors.title}</small>}
      <label>Desired outcome<textarea value={planDraft.outcome} maxLength={300} onChange={event => updatePlan('outcome', event.target.value)} /></label>{planErrors.outcome && <small role="alert">{planErrors.outcome}</small>}
      <label>Why this matters<textarea value={planDraft.why} maxLength={300} onChange={event => updatePlan('why', event.target.value)} /></label>{planErrors.why && <small role="alert">{planErrors.why}</small>}
      <label>Target date<input type="date" min={localDate()} value={planDraft.targetDate} onChange={event => updatePlan('targetDate', event.target.value)} /></label>{planErrors.targetDate && <small role="alert">{planErrors.targetDate}</small>}
      <fieldset><legend>Working days for this Plan</legend><div className="day-choices">{workingDays.map(day => <button type="button" key={day} aria-pressed={planDraft.workingDays.includes(day)} className={planDraft.workingDays.includes(day) ? '' : 'secondary'} onClick={() => { setPlanDraft(current => ({ ...current, workingDays: current.workingDays.includes(day) ? current.workingDays.filter(value => value !== day) : [...current.workingDays, day] })); setPlanErrors(current => ({ ...current, workingDays: undefined })); }}>{dayLabels[day]}</button>)}</div></fieldset>{planErrors.workingDays && <small role="alert">{planErrors.workingDays}</small>}
      <label>Hours for this Plan each week<input type="number" min="1" max="40" value={planDraft.weeklyHours} onChange={event => updatePlan('weeklyHours', Number(event.target.value))} /></label>{planErrors.weeklyHours && <small role="alert">{planErrors.weeklyHours}</small>}
      <div className="actions"><button type="submit">Review Plan</button><button type="button" className="secondary" onClick={() => setStage('today')}>Cancel</button></div>
    </form></section></main>;
  }

  if (stage === 'plan-review') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card"><span className="status">Review your Plan</span><h1>{planDraft.title.trim()}</h1><dl><dt>Desired outcome</dt><dd>{planDraft.outcome.trim()}</dd><dt>Why it matters</dt><dd>{planDraft.why.trim()}</dd><dt>Target date</dt><dd>{formatLongDate(planDraft.targetDate)}</dd><dt>Working days</dt><dd>{orderWorkingDays(planDraft.workingDays).map(day => dayLabels[day]).join(', ')}</dd><dt>Weekly time</dt><dd>{planDraft.weeklyHours} hours</dd></dl>{planSaveFailed && <div className="notice" role="alert">Your Plan wasn’t saved. Check your connection and try again.</div>}<div className="actions"><button onClick={savePlan} disabled={savingPlan}>{savingPlan ? 'Saving Plan…' : 'Create Plan'}</button><button className="secondary" onClick={() => setStage('plan-create')} disabled={savingPlan}>Edit</button><button className="secondary" onClick={() => setStage('today')} disabled={savingPlan}>Cancel</button></div></section></main>;
  }

  if (stage === 'plan-saved') {
    return <main className="shell"><p className="eyebrow">Longview</p><section className="card success"><span className="status">Plan saved</span><h1>{planDraft.title.trim()}</h1><p>Your Plan is ready. Longview will use it to shape your next useful step.</p><button onClick={() => setStage('today')}>Return to Today</button></section></main>;
  }

  if (stage === 'today') {
    return <main className="app-shell"><header><p className="eyebrow">Longview</p><span className="status">Plan-based schedules</span></header>
      {view === 'today' && <section className="today-view" aria-busy={plans.snapshot.status === 'idle' || plans.snapshot.status === 'loading' || approvedDay.snapshot.status === 'idle' || approvedDay.snapshot.status === 'loading'}><span className="status">Today</span>
        {(approvedDay.snapshot.status === 'idle' || approvedDay.snapshot.status === 'loading') && <div className="empty"><h1>Checking today’s schedule…</h1><p>Making sure you see the latest saved day.</p></div>}
        {approvedDay.snapshot.status === 'error' && <div className="empty" role="alert"><h1>Today’s schedule couldn’t be checked.</h1><p>No task is shown until Longview can confirm whether today is a work day or a break.</p><button onClick={() => void approvedDay.reload()}>Try again</button></div>}
        {todayBreakDay && <div className="empty"><h1>You’re taking a break today.</h1><p>Nothing was marked complete. {todayBreakDay.carryoverCount === 1 ? 'Your unfinished task will be offered again on its next scheduled Plan day.' : `Your ${todayBreakDay.carryoverCount} unfinished tasks will be offered again on their next scheduled Plan days.`}</p><div className="notice"><strong>You can leave Today here.</strong><p>You’ll review the carried work before anything is added to a future day.</p></div><div className="actions"><button onClick={() => setView('calendar')}>Review Calendar</button><button className="secondary" onClick={() => setView('plans')}>View all Plans</button></div></div>}
        {approvedDay.snapshot.status === 'ready' && !todayBreakDay && (plans.snapshot.status === 'idle' || plans.snapshot.status === 'loading') && <div className="empty"><h1>Preparing Today…</h1><p>Finding one useful step from your saved Plans.</p></div>}
        {approvedDay.snapshot.status === 'ready' && !todayBreakDay && plans.snapshot.status === 'error' && <div className="empty"><h1>Today couldn’t be prepared.</h1><p>Your Plans are unchanged. Check your connection and try again.</p><button onClick={plans.retry}>Try again</button></div>}
        {approvedDay.snapshot.status === 'ready' && !todayBreakDay && plans.snapshot.status === 'ready' && !todayStep && plans.snapshot.plans.length === 0 && <div className="empty"><h1>Nothing is scheduled yet.</h1><p>Create your first Plan and choose the days you want to work on it.</p><button onClick={startNewPlan}>Create first Plan</button></div>}
        {approvedDay.snapshot.status === 'ready' && !todayBreakDay && plans.snapshot.status === 'ready' && !todayStep && plans.snapshot.plans.length > 0 && plans.snapshot.plans.some(plan => !plan.workingDays) && <div className="empty"><h1>A Plan needs a schedule.</h1><p>Open the Plan and add at least one working day before it can appear in Today.</p><button onClick={() => setView('plans')}>View Plans</button></div>}
        {approvedDay.snapshot.status === 'ready' && !todayBreakDay && plans.snapshot.status === 'ready' && !todayStep && plans.snapshot.plans.length > 0 && plans.snapshot.plans.every(plan => plan.workingDays) && <div className="empty"><h1>Nothing scheduled today.</h1><p>{nextScheduledDate ? `Your next scheduled Plan day is ${formatLongDate(nextScheduledDate)}.` : 'No active Plan has an upcoming working day.'}</p><button onClick={() => setView('plans')}>View Plans</button></div>}
        {approvedDay.snapshot.status === 'ready' && !todayBreakDay && plans.snapshot.status === 'ready' && todayStep && completion.snapshot.status === 'ready' && completion.snapshot.completion && <div className="today-content"><h1>{completion.snapshot.duplicate ? 'Progress already saved.' : 'Today’s step is complete.'}</h1><p>{completion.snapshot.duplicate ? 'That progress was already saved. No second completion was added and your Plan was not changed.' : 'You recorded meaningful progress without changing your Plan.'}</p><TodayStepCard step={todayStep} completed /><div className="notice"><strong>{completion.snapshot.duplicate ? 'One completion record remains.' : 'Completion saved.'}</strong><p>Completion record: {completion.snapshot.completion.id}</p></div><button className="secondary" onClick={() => setView('plans')}>View all Plans</button></div>}
        {approvedDay.snapshot.status === 'ready' && !todayBreakDay && plans.snapshot.status === 'ready' && todayStep && !completion.snapshot.completion && completion.pending && (completion.syncStatus === 'pending' || completion.syncStatus === 'syncing' || completion.syncStatus === 'retry') && <PendingTodayCompletion step={todayStep} syncStatus={completion.syncStatus} offline={completion.offline} onRetry={() => void completion.retrySync()} />}
        {approvedDay.snapshot.status === 'ready' && !todayBreakDay && plans.snapshot.status === 'ready' && todayStep && !completion.snapshot.completion && completion.syncStatus === 'blocked' && <div className="today-content"><h1>This completion needs attention</h1><p>Longview could not safely match the saved progress to this workspace, so it was not added or replaced.</p><TodayStepCard step={todayStep} /><div className="notice" role="alert"><strong>Your Plan is unchanged.</strong><p>Check that you’re using the same account, then try again.</p></div>{completion.pending && <button onClick={() => void completion.retrySync()} disabled={completion.offline}>{completion.offline ? 'Reconnect to try again' : 'Try sync again'}</button>}</div>}
        {approvedDay.snapshot.status === 'ready' && !todayBreakDay && plans.snapshot.status === 'ready' && todayStep && completion.snapshot.status !== 'ready' && <div className="today-content"><h1>One useful step is enough.</h1><p>Start with the nearest active Plan. You can refine the step later.</p><TodayStepCard step={todayStep} />{completion.snapshot.status === 'error' ? <div className="notice" role="alert">Progress couldn’t be checked. Nothing was changed.<button onClick={completion.retry}>Try again</button></div> : <button disabled>Checking progress…</button>}</div>}
        {approvedDay.snapshot.status === 'ready' && !todayBreakDay && plans.snapshot.status === 'ready' && todayStep && completion.snapshot.status === 'ready' && !completion.snapshot.completion && !completion.pending && completion.syncStatus !== 'blocked' && <div className="today-content"><h1>One useful step is enough.</h1><p>Start with the nearest active Plan. You can refine the step later.</p><TodayStepCard step={todayStep} />{approvalProposal ? <ClaraApprovalPanel proposal={approvalProposal} state={approvalState} onApprove={applyClaraChange} onReject={closeClaraApproval} onReturn={closeClaraApproval} /> : showClara ? <ClaraPanel clara={clara} onReview={reviewClaraChange} onClose={() => { clara.cancel(); setShowClara(false); }} /> : <button className="secondary" onClick={askClara}>Ask Clara about this step</button>}{completion.saveFailed && <div className="notice" role="alert">Completion wasn’t saved on this device. Your step is still open. Try again.</div>}{confirmComplete ? <div className="notice" role="alert"><p>{completion.offline ? 'Save this completion on your device? Longview will sync it after your connection returns.' : 'Mark this step complete for today? Your Plan and schedule will stay the same.'}</p><div className="actions"><button onClick={async () => { if (await completion.complete()) setConfirmComplete(false); }} disabled={completion.completing}>{completion.completing ? 'Saving completion…' : completion.offline ? 'Save on this device' : 'Confirm completion'}</button><button className="secondary" onClick={() => setConfirmComplete(false)} disabled={completion.completing}>Keep working</button></div></div> : <div className="actions"><button onClick={() => setConfirmComplete(true)}>Mark step complete</button><button className="secondary" onClick={() => setView('plans')}>View all Plans</button></div>}</div>}
      </section>}
      {view === 'plans' && <section className="plans-view" aria-busy={plans.snapshot.status === 'loading'}><span className="status">Plans</span>
        {(plans.snapshot.status === 'idle' || plans.snapshot.status === 'loading') && <div className="empty"><h1>Loading your Plans…</h1><p>Bringing your priorities into view.</p></div>}
        {plans.snapshot.status === 'error' && <div className="empty"><h1>Your Plans couldn’t be loaded.</h1><p>Check your connection and try again. Nothing has been changed.</p><button onClick={plans.retry}>Try again</button></div>}
        {plans.snapshot.status === 'ready' && plans.snapshot.plans.length === 0 && <div className="empty"><h1>No Plans yet.</h1><p>Your long-term priorities will appear here after you create your first Plan.</p><button onClick={startNewPlan}>Create first Plan</button></div>}
        {plans.snapshot.status === 'ready' && plans.snapshot.plans.length > 0 && <><div className="plans-heading"><div><h1>Your Plans</h1><p>See how every active Plan shares your committed weekly time.</p></div><button onClick={startNewPlan}>Create Plan</button></div><section className="portfolio-summary"><div><span className="status">Committed weekly time</span><strong>{portfolio.totalWeeklyHours} hours</strong><small>Across {portfolio.entries.length} active {portfolio.entries.length === 1 ? 'Plan' : 'Plans'}</small></div><div className="allocation-list">{portfolio.entries.map(entry => <div key={entry.plan.id}><span>{entry.plan.title}</span><strong>{entry.plan.weeklyHours}h · {entry.percent}%</strong></div>)}</div></section><div className="notice"><strong>Portfolio guidance</strong><p>{portfolio.recommendation}</p><small>Suggested from target dates and current allocations. Nothing was changed.</small></div><div className="plan-grid">{portfolio.entries.map(({ plan, mode, percent }) => <article className="plan-card" key={plan.id}><span className="status">{mode} · {percent}% of committed time</span><h2>{plan.title}</h2><p>{plan.outcome}</p><dl><dt>Milestone</dt><dd>Reach target by {formatLongDate(plan.targetDate)}</dd><dt>Working days</dt><dd>{plan.workingDays ? orderWorkingDays(plan.workingDays).map(day => dayLabels[day]).join(', ') : 'Not set'}</dd><dt>Weekly time</dt><dd>{plan.weeklyHours} hours</dd></dl><button onClick={() => openPlanDetails(plan)}>View Plan details</button></article>)}</div></>}
      </section>}
      {view === 'calendar' && <ScheduleRunPanel scheduleRun={scheduleRun} approvedDay={approvedDay} dayBreak={dayBreak} capacityMinutes={planningWindow} eligibleCount={scheduleRunContext?.steps.length ?? 0} scheduledCount={calendarSteps.length} planCount={portfolio.entries.length} preparationStatus={calendarPreparationStatus} onCapacity={setPlanningWindow} onStart={startScheduleRun} onReset={resetCalendarProposal} onReturn={() => { resetCalendarProposal(); setView('today'); void approvedDay.reload(); }} onCreatePlan={() => { resetCalendarProposal(); startNewPlan(); }} onReviewPlans={() => { resetCalendarProposal(); setView('plans'); }} onRetryPreparation={() => plans.snapshot.status === 'error' ? plans.retry() : calendarCompletions.retry()} />}
      {view === 'settings' && <section className="empty"><span className="status">Settings</span><h1>Account and privacy</h1><p>Plan schedules are managed inside each Plan.</p>{snapshot.user.isAnonymous && !confirmSignOut && !confirmClear && <button onClick={auth.linkGoogle} disabled={snapshot.linking}>{snapshot.linking ? 'Opening Google…' : 'Link Google account'}</button>}<div className="actions"><button className="secondary" onClick={() => snapshot.user.isAnonymous ? setConfirmSignOut(true) : auth.signOut()}>Sign out</button><button className="danger" onClick={() => setConfirmClear(true)}>Clear this device</button></div>{snapshot.failure && <div className="notice" role="alert">{failureCopy[snapshot.failure]}{snapshot.failure === 'account-conflict' && snapshot.user.isAnonymous && <button onClick={auth.useExistingGoogle}>Use existing Google workspace</button>}</div>}{confirmSignOut && <div className="notice" role="alert"><p>If you saved progress while offline, reconnect and wait for it to finish syncing before you sign out. If you sign out now, you won’t be able to return to this workspace. Link Google first to keep access.</p><div className="actions"><button onClick={auth.linkGoogle}>Link Google account</button><button className="danger" onClick={auth.signOut}>Sign out and lose access</button><button className="secondary" onClick={() => setConfirmSignOut(false)}>Cancel</button></div></div>}{confirmClear && <div className="notice" role="alert"><p>{snapshot.user.isAnonymous ? 'Clearing this device removes any progress still waiting to sync and signs you out. You won’t be able to return to this anonymous workspace. Link Google first to keep access.' : 'Clearing this device removes any progress still waiting to sync, then signs you out. Your confirmed workspace will still be available when you sign in again.'}</p><div className="actions">{snapshot.user.isAnonymous && <button onClick={auth.linkGoogle}>Link Google account</button>}<button className="danger" onClick={clearLocalData}>Clear this device and sign out</button><button className="secondary" onClick={() => setConfirmClear(false)}>Cancel</button></div></div>}</section>}
      <nav aria-label="Primary"><button aria-current={view === 'today' ? 'page' : undefined} className={view === 'today' ? '' : 'secondary'} onClick={() => setView('today')}>Today</button><button aria-current={view === 'calendar' ? 'page' : undefined} className={view === 'calendar' ? '' : 'secondary'} onClick={() => setView('calendar')}>Calendar</button><button aria-current={view === 'plans' ? 'page' : undefined} className={view === 'plans' ? '' : 'secondary'} onClick={() => setView('plans')}>Plans</button><button aria-current={view === 'settings' ? 'page' : undefined} className={view === 'settings' ? '' : 'secondary'} onClick={() => setView('settings')}>Settings</button></nav></main>;
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
        {snapshot.user.isAnonymous && <div className="actions"><button onClick={continueSetup}>Continue setup</button><button className="secondary" onClick={auth.linkGoogle} disabled={snapshot.linking}>{snapshot.linking ? 'Opening Google…' : 'Link Google account'}</button></div>}
        {!snapshot.user.isAnonymous && <button onClick={continueSetup}>Continue setup</button>}
      </section>
    </main>
  );
}

export function App({ gateway = firebaseAuthGateway, workspaceGateway = lazyFirebaseWorkspaceGateway, planGateway = lazyFirebasePlanGateway, todayGateway = lazyFirebaseTodayGateway, todayOutbox = lazyIndexedDbTodayOutbox, claraGateway = lazyClaraGateway, claraApprovalGateway = lazyClaraApprovalGateway, scheduleRunGateway = lazyScheduleRunGateway, approvedDayGateway = lazyApprovedDayGateway, dayBreakGateway = lazyDayBreakGateway }: { gateway?: AuthGateway; workspaceGateway?: WorkspaceGateway; planGateway?: PlanGateway; todayGateway?: TodayGateway; todayOutbox?: TodayOutbox; claraGateway?: ClaraGateway; claraApprovalGateway?: ClaraApprovalGateway; scheduleRunGateway?: ScheduleRunGateway; approvedDayGateway?: ApprovedDayGateway; dayBreakGateway?: DayBreakGateway }) {
  const auth = useAuth(gateway);
  const { snapshot } = auth;

  if (snapshot.status === 'loading') {
    return <main className="shell" aria-busy="true"><p className="eyebrow">Longview</p><h1>Restoring your workspace…</h1></main>;
  }

  if (snapshot.status === 'authenticated') {
    return <WorkspaceReady auth={auth} gateway={workspaceGateway} planGateway={planGateway} todayGateway={todayGateway} todayOutbox={todayOutbox} claraGateway={claraGateway} claraApprovalGateway={claraApprovalGateway} scheduleRunGateway={scheduleRunGateway} approvedDayGateway={approvedDayGateway} dayBreakGateway={dayBreakGateway} />;
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
