// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'longview-rules-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await readFile('firestore.rules', 'utf8')
    }
  });
});

afterAll(async () => environment.cleanup());
beforeEach(async () => environment.clearFirestore());

describe('Firestore ownership rules', () => {
  it('allows an authenticated owner to create and read their profile', async () => {
    const db = environment.authenticatedContext('owner').firestore();
    const profile = doc(db, 'users/owner');
    await assertSucceeds(setDoc(profile, { uid: 'owner', displayName: 'Owner' }));
    await assertSucceeds(getDoc(profile));
  });

  it('denies unauthenticated and cross-user access', async () => {
    const ownerProfile = doc(environment.authenticatedContext('owner').firestore(), 'users/owner');
    const otherProfile = doc(environment.authenticatedContext('other').firestore(), 'users/owner');
    const publicProfile = doc(environment.unauthenticatedContext().firestore(), 'users/owner');
    await assertFails(getDoc(otherProfile));
    await assertFails(getDoc(publicProfile));
    expect(ownerProfile.path).toBe('users/owner');
  });

  it('rejects forged ownership and profile deletion', async () => {
    const db = environment.authenticatedContext('owner').firestore();
    await assertFails(setDoc(doc(db, 'users/owner'), { uid: 'other' }));
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'users/owner'), { uid: 'owner' });
    });
    await assertFails(deleteDoc(doc(db, 'users/owner')));
  });

  it('allows only immutable, owner-matching default workspaces', async () => {
    const owner = environment.authenticatedContext('owner').firestore();
    const other = environment.authenticatedContext('other').firestore();
    const workspace = doc(owner, 'users/owner/workspaces/default');
    await assertSucceeds(setDoc(workspace, { id: 'default', ownerUid: 'owner', schemaVersion: 1 }));
    await assertFails(setDoc(doc(other, 'users/owner/workspaces/other'), { id: 'other', ownerUid: 'other' }));
    await assertFails(setDoc(workspace, { id: 'changed', ownerUid: 'owner' }));
    await assertFails(deleteDoc(workspace));
  });

  it('allows owners to create valid Plans with a schedule', async () => {
    const owner = environment.authenticatedContext('owner').firestore();
    const plan = doc(owner, 'users/owner/workspaces/default/plans/plan-1');
    const valid = {
      id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
      title: 'Launch a useful product', outcome: 'Release a tested product to real users.',
      why: 'Learn which problem is worth solving well.', targetDate: '2026-09-30',
      weeklyHours: 10, workingDays: ['mon', 'wed', 'fri'], status: 'active', schemaVersion: 2,
      scheduleVersion: 1,
      createdAt: new Date(), updatedAt: new Date()
    };
    await assertSucceeds(setDoc(plan, valid));
    await assertSucceeds(getDoc(plan));
    await assertFails(updateDoc(plan, { title: 'Changed title', updatedAt: new Date() }));
    await assertFails(deleteDoc(plan));
  });

  it('allows only versioned owner Plan schedule updates', async () => {
    const owner = environment.authenticatedContext('owner').firestore();
    const other = environment.authenticatedContext('other').firestore();
    const path = 'users/owner/workspaces/default/plans/plan-1';
    const valid = {
      id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
      title: 'Launch a useful product', outcome: 'Release a tested product to real users.',
      why: 'Learn which problem is worth solving well.', targetDate: '2026-09-30',
      weeklyHours: 10, workingDays: ['mon'], status: 'active', schemaVersion: 2,
      scheduleVersion: 1, createdAt: new Date(), updatedAt: new Date()
    };
    await environment.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), path), valid));
    await assertSucceeds(updateDoc(doc(owner, path), {
      workingDays: ['tue', 'thu'], weeklyHours: 8, schemaVersion: 2,
      scheduleVersion: 2, updatedAt: new Date()
    }));
    await assertFails(updateDoc(doc(owner, path), {
      workingDays: ['fri'], weeklyHours: 6, schemaVersion: 2,
      scheduleVersion: 2, updatedAt: new Date()
    }));
    await assertFails(updateDoc(doc(owner, path), {
      workingDays: [], weeklyHours: 6, schemaVersion: 2,
      scheduleVersion: 3, updatedAt: new Date()
    }));
    await assertFails(updateDoc(doc(other, path), {
      workingDays: ['fri'], weeklyHours: 6, schemaVersion: 2,
      scheduleVersion: 3, updatedAt: new Date()
    }));
  });

  it('adds a schedule to a legacy Plan without changing its content', async () => {
    const owner = environment.authenticatedContext('owner').firestore();
    const path = 'users/owner/workspaces/default/plans/legacy-plan';
    const legacy = {
      id: 'legacy-plan', clientRequestId: 'legacy-plan', ownerUid: 'owner', workspaceId: 'default',
      title: 'Keep an existing Plan', outcome: 'Preserve this Plan while adding its schedule.',
      why: 'Existing work must never be silently discarded.', targetDate: '2026-09-30',
      weeklyHours: 5, status: 'active', schemaVersion: 1,
      createdAt: new Date(), updatedAt: new Date()
    };
    await environment.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), path), legacy));
    await assertSucceeds(updateDoc(doc(owner, path), {
      workingDays: ['tue', 'thu'], weeklyHours: 5, schemaVersion: 2,
      scheduleVersion: 1, updatedAt: new Date()
    }));
    const saved = (await getDoc(doc(owner, path))).data();
    expect(saved).toMatchObject({ title: legacy.title, workingDays: ['tue', 'thu'], scheduleVersion: 1 });
  });

  it('rejects forged, malformed, and cross-user Plans', async () => {
    const owner = environment.authenticatedContext('owner').firestore();
    const other = environment.authenticatedContext('other').firestore();
    const path = 'users/owner/workspaces/default/plans/plan-1';
    const base = {
      id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
      title: 'Launch a useful product', outcome: 'Release a tested product to real users.',
      why: 'Learn which problem is worth solving well.', targetDate: '2026-09-30',
      weeklyHours: 10, workingDays: ['mon'], status: 'active', schemaVersion: 2,
      scheduleVersion: 1,
      createdAt: new Date(), updatedAt: new Date()
    };
    await assertFails(setDoc(doc(other, path), base));
    await assertFails(setDoc(doc(owner, path), { ...base, ownerUid: 'other' }));
    await assertFails(setDoc(doc(owner, path), { ...base, title: 'No' }));
    await assertFails(setDoc(doc(owner, path), { ...base, weeklyHours: 41 }));
    await assertFails(setDoc(doc(owner, path), { ...base, workingDays: [] }));
    await assertFails(setDoc(doc(owner, path), { ...base, workingDays: ['mon', 'mon'] }));
    await assertFails(setDoc(doc(owner, path), { ...base, targetDate: 'not-a-date' }));
    await assertFails(setDoc(doc(owner, path), { ...base, unexpected: true }));
  });

  it('allows only the owner to list their Plans', async () => {
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'users/owner/workspaces/default/plans/plan-1'), {
        id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
        title: 'Launch a useful product', outcome: 'Release a tested product to real users.',
        why: 'Learn which problem is worth solving well.', targetDate: '2026-09-30',
        weeklyHours: 10, workingDays: ['mon'], status: 'active', schemaVersion: 2,
        scheduleVersion: 1,
        createdAt: new Date(), updatedAt: new Date()
      });
    });
    const ownerPlans = collection(environment.authenticatedContext('owner').firestore(), 'users/owner/workspaces/default/plans');
    const otherPlans = collection(environment.authenticatedContext('other').firestore(), 'users/owner/workspaces/default/plans');
    const publicPlans = collection(environment.unauthenticatedContext().firestore(), 'users/owner/workspaces/default/plans');
    await assertSucceeds(getDocs(ownerPlans));
    await assertFails(getDocs(otherPlans));
    await assertFails(getDocs(publicPlans));
  });

  it('allows an owner to record one immutable Today completion', async () => {
    const owner = environment.authenticatedContext('owner').firestore();
    const planPath = 'users/owner/workspaces/default/plans/plan-1';
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), planPath), {
        id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
        title: 'Launch a useful product', outcome: 'Release a tested product to real users.',
        why: 'Learn which problem is worth solving well.', targetDate: '2026-09-30',
        weeklyHours: 10, workingDays: ['mon'], status: 'active', schemaVersion: 2,
        scheduleVersion: 1,
        createdAt: new Date(), updatedAt: new Date()
      });
    });
    const completion = doc(owner, 'users/owner/workspaces/default/todayCompletions/2026-08-17_plan-1_first-proof-v1');
    const valid = {
      id: '2026-08-17_plan-1_first-proof-v1', ownerUid: 'owner', workspaceId: 'default',
      planId: 'plan-1', stepKey: 'first-proof-v1', completedDate: '2026-08-17',
      durationMinutes: 60, status: 'completed', schemaVersion: 1, completedAt: new Date()
    };
    await assertSucceeds(setDoc(completion, valid));
    await assertSucceeds(getDoc(completion));
    await assertFails(setDoc(completion, { ...valid, durationMinutes: 30 }));
    await assertFails(deleteDoc(completion));
  });

  it('rejects forged, malformed, and cross-user Today completions', async () => {
    const owner = environment.authenticatedContext('owner').firestore();
    const other = environment.authenticatedContext('other').firestore();
    const path = 'users/owner/workspaces/default/todayCompletions/completion-1';
    const base = {
      id: 'completion-1', ownerUid: 'owner', workspaceId: 'default', planId: 'plan-1',
      stepKey: 'first-proof-v1', completedDate: '2026-08-17', durationMinutes: 60,
      status: 'completed', schemaVersion: 1, completedAt: new Date()
    };
    await assertFails(setDoc(doc(other, path), base));
    await assertFails(setDoc(doc(owner, path), { ...base, ownerUid: 'other' }));
    await assertFails(setDoc(doc(owner, path), { ...base, durationMinutes: 61 }));
    await assertFails(setDoc(doc(owner, path), { ...base, completedDate: 'not-a-date' }));
    await assertFails(setDoc(doc(owner, path), base));
  });
});
