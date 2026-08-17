import type { ClaraGateway } from './types';
import { managedClaraGateway } from './managedGateway';
import { previewClaraGateway } from './previewGateway';

export const lazyClaraGateway: ClaraGateway = import.meta.env.VITE_CLARA_API_URL
  ? managedClaraGateway
  : previewClaraGateway;
