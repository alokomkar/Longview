import type { ScheduleRunGateway } from './types';

export const previewScheduleRunGateway: ScheduleRunGateway = {
  async start() { throw new Error('The local Clara service is required for schedule runs.'); },
  async get() { throw new Error('The local Clara service is required for schedule runs.'); },
  async cancel() { throw new Error('The local Clara service is required for schedule runs.'); }
};
