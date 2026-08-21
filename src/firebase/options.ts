export function resolveFirebaseAuthDomain(configuredDomain: string | undefined, projectId: string) {
  const normalizedDomain = configuredDomain?.trim();
  return normalizedDomain || `${projectId}.firebaseapp.com`;
}
