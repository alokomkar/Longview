import type { ClaraApprovalGateway } from './approvalTypes';

export const previewClaraApprovalGateway: ClaraApprovalGateway = {
  async apply() {
    throw new Error('Approved changes require the managed Clara API.');
  }
};
