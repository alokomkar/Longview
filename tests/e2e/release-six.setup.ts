import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

export default async function setup() {
  const environment = await initializeTestEnvironment({
    projectId: 'longview-release-six-e2e',
    firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') }
  });
  await environment.clearFirestore();
  await environment.cleanup();
}
