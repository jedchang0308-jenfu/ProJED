import { dataBackend } from '../services/dataBackend';
import { useFirestoreSync } from './useFirestoreSync';
import { useSupabaseSync } from './useSupabaseSync';

export function useDataSync() {
  useFirestoreSync({ enabled: dataBackend === 'firebase' });
  useSupabaseSync({ enabled: dataBackend === 'supabase' });
}
