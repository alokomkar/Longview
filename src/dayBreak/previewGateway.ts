import type { DayBreakGateway } from './types';

export const previewDayBreakGateway: DayBreakGateway = {
  async preview() {
    throw new Error('Day breaks require the managed Clara API.');
  },
  async confirm() {
    throw new Error('Day breaks require the managed Clara API.');
  }
};
