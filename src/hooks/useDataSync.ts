import { dataBackend } from '../services/dataBackend';
import { useFirestoreSync } from './useFirestoreSync';
import { useMemberSync } from './useMemberSync';
import { useSupabaseSync } from './useSupabaseSync';
import { useTagSync } from './useTagSync';
import { useHttpSync } from './useHttpSync';

export function useDataSync() {
  useFirestoreSync({ enabled: dataBackend === 'firebase' });
  useSupabaseSync({ enabled: dataBackend === 'supabase' });
  useHttpSync({ enabled: dataBackend === 'http' });
  useMemberSync();
  useTagSync();
}
