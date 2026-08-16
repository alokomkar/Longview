// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

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
});
