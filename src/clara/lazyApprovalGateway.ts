import type { ClaraApprovalGateway } from './approvalTypes';
import { managedClaraApprovalGateway } from './managedApprovalGateway';
import { previewClaraApprovalGateway } from './previewApprovalGateway';

export const lazyClaraApprovalGateway: ClaraApprovalGateway = import.meta.env.VITE_CLARA_API_URL
  ? managedClaraApprovalGateway
  : previewClaraApprovalGateway;
