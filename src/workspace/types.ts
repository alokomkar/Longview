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
