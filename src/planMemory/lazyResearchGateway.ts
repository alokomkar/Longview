import type { ResearchGateway } from './types';
import { managedResearchGateway } from './managedResearchGateway';
import { previewResearchGateway } from './previewResearchGateway';

export const lazyResearchGateway: ResearchGateway = import.meta.env.VITE_CLARA_API_URL
  ? managedResearchGateway
  : previewResearchGateway;
