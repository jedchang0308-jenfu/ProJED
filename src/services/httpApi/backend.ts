import { createHttpCollaborationAdapter } from './collaborationAdapter';
import { createHttpDomainReadAdapter } from './domainReadAdapter';
import { createHttpDomainWriteAdapter } from './domainWriteAdapter';
import { HttpApiClient } from './httpApiClient';
import { createHttpRecordActivityAdapter } from './recordActivityAdapter';
import { createHttpSessionAdapter } from './sessionAdapter';

export const httpApiClient = new HttpApiClient();
export const httpDomainReadService = createHttpDomainReadAdapter(httpApiClient);
export const httpDomainWriteService = createHttpDomainWriteAdapter(httpApiClient);
export const httpCollaborationService = createHttpCollaborationAdapter(httpApiClient);
export const httpRecordActivityService = createHttpRecordActivityAdapter(httpApiClient);
export const httpSessionService = createHttpSessionAdapter(httpApiClient);
