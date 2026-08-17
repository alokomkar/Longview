import type { AuthUser } from '../auth/types';

export type Workspace = {
  id: 'default';
  ownerUid: string;
  schemaVersion: 1;
};

export interface WorkspaceGateway {
  ensure(user: AuthUser): Promise<Workspace>;
}

export type WorkspaceSnapshot =
  | { status: 'loading' }
  | { status: 'ready'; workspace: Workspace }
  | { status: 'error' };

export function profileIdentityChanged(profile: unknown, user: AuthUser) {
  if (typeof profile !== 'object' || profile === null) return true;
  const data = profile as Record<string, unknown>;
  return data.displayName !== user.displayName || data.authMode !== (user.isAnonymous ? 'anonymous' : 'google');
}
