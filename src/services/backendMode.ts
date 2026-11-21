export type DataBackend = 'firebase' | 'supabase' | 'local-test' | 'http';

export const resolveDataBackend = (configured: string | undefined): DataBackend => (
  configured === 'http'
    ? 'http'
    : configured === 'local-test'
      ? 'local-test'
      : configured === 'supabase'
        ? 'supabase'
        : 'firebase'
);

const configuredBackend = (import.meta as ImportMeta & {
  env?: { VITE_DATA_BACKEND?: string };
}).env?.VITE_DATA_BACKEND;

export const dataBackend = resolveDataBackend(configuredBackend);
export const isSupabaseBackend = dataBackend === 'supabase';
export const isLocalTestBackend = dataBackend === 'local-test';
export const isHttpBackend = dataBackend === 'http';

export class BackendFeatureUnavailableError extends Error {
  readonly code = 'BACKEND_UNSUPPORTED';

  constructor(feature: string) {
    super(`${feature} 尚未接到目前的雲端後端。`);
    this.name = 'BackendFeatureUnavailableError';
  }
}

export const requireLegacyProviderFeature = (
  feature: string,
  backend: DataBackend = dataBackend,
): void => {
  if (backend === 'http') throw new BackendFeatureUnavailableError(feature);
};
