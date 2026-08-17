import { managedDayBreakGateway } from './managedGateway';
import { previewDayBreakGateway } from './previewGateway';
import type { DayBreakGateway } from './types';

export const lazyDayBreakGateway: DayBreakGateway = import.meta.env.VITE_CLARA_API_URL
  ? managedDayBreakGateway
  : previewDayBreakGateway;
