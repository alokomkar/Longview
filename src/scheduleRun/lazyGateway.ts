import { managedScheduleRunGateway } from './managedGateway';
import { previewScheduleRunGateway } from './previewGateway';
import type { ScheduleRunGateway } from './types';

export const lazyScheduleRunGateway: ScheduleRunGateway = import.meta.env.VITE_CLARA_API_URL
  ? managedScheduleRunGateway
  : previewScheduleRunGateway;
