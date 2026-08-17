import { managedApprovedDayGateway } from './managedGateway';
import { previewApprovedDayGateway } from './previewGateway';
import type { ApprovedDayGateway } from './types';

export const lazyApprovedDayGateway: ApprovedDayGateway = import.meta.env.VITE_CLARA_API_URL
  ? managedApprovedDayGateway
  : previewApprovedDayGateway;
