import type { TaskFilterState } from '../../features/taskFilters';
import { isSupabaseBackend } from '../dataBackend';
import { isSupabaseConfigured, supabase } from './client';
import type { Json } from './database.types';

export type TaskFilterPreferenceRemoteRow = {
  accountId: string;
  projectId: string;
  preferenceVersion: number;
  filters: unknown;
  createdAt: string;
  updatedAt: string;
};

export const shouldUseRemoteTaskFilterPreferences = () => isSupabaseBackend && isSupabaseConfigured;

export const taskFilterPreferenceService = {
  enabled: shouldUseRemoteTaskFilterPreferences(),

  async read(accountId: string, projectId: string): Promise<TaskFilterPreferenceRemoteRow | null> {
    const { data, error } = await supabase
      .from('account_board_task_filter_preferences')
      .select('account_id, project_id, preference_version, filters, created_at, updated_at')
      .eq('account_id', accountId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      accountId: data.account_id,
      projectId: data.project_id,
      preferenceVersion: data.preference_version,
      filters: data.filters,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  },

  async upsert(accountId: string, projectId: string, filters: TaskFilterState): Promise<void> {
    const filtersPayload = {
      preference_version: 4,
      filters: filters as unknown as Json,
    };
    const { data: updated, error: updateError } = await supabase
      .from('account_board_task_filter_preferences')
      .update(filtersPayload)
      .eq('account_id', accountId)
      .eq('project_id', projectId)
      .eq('preference_version', 4)
      .select('account_id')
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (updated) return;

    // Insert only when no current v4 row exists. A duplicate caused by a newer
    // or concurrent row fails safely and is handled by the bounded retry path.
    const { error: insertError } = await supabase
      .from('account_board_task_filter_preferences')
      .insert({
        account_id: accountId,
        project_id: projectId,
        ...filtersPayload,
      });
    if (insertError) throw new Error(insertError.message);
  },

  async remove(accountId: string, projectId: string): Promise<void> {
    const { error } = await supabase
      .from('account_board_task_filter_preferences')
      .delete()
      .eq('account_id', accountId)
      .eq('project_id', projectId);
    if (error) throw new Error(error.message);
  },
};
