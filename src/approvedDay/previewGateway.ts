import type { ApprovedDayGateway } from './types';

export const previewApprovedDayGateway: ApprovedDayGateway = {
  async get() {
    return null;
  },
  async approve() {
    throw new Error('Approved days require the managed Clara API.');
  }
};
