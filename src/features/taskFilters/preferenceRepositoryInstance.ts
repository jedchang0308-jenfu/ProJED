import { taskFilterPreferenceService } from '../../services/supabase/taskFilterPreferenceService';
import { createTaskFilterPreferenceRepository } from './preferenceRepository';

export const taskFilterPreferenceRepository = createTaskFilterPreferenceRepository(
  taskFilterPreferenceService,
);
