/** Actual project/model qualification, never an API key or environment opt-in.
 * Meeting qualification covers only Flash; RAG also retains Flash-Lite. */
export interface RagRuntimeBinding {
  readonly projectId: 'projed-cc78d';
  readonly provider: 'google-cloud-rag';
  readonly embeddingModel: 'gemini-embedding-001';
  readonly generationModels: readonly ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];
  readonly abuseMonitoring: 'exempt';
  readonly cache: 'disabled';
  readonly requestResponseLogging: 'disabled';
  readonly qualificationEvidenceRef: string;
}

export const CURRENT_RAG_BINDING: RagRuntimeBinding | null = null;

export function hasQualifiedRagBinding(binding: RagRuntimeBinding | null): binding is RagRuntimeBinding {
  return Boolean(binding) && binding !== null && binding.projectId === 'projed-cc78d' && binding.provider === 'google-cloud-rag'
    && binding.embeddingModel === 'gemini-embedding-001' && Array.isArray(binding.generationModels)
    && binding.generationModels.length === 2
    && binding.generationModels.includes('gemini-3.1-flash-lite') && binding.generationModels.includes('gemini-3.5-flash')
    && binding.abuseMonitoring === 'exempt' && binding.cache === 'disabled' && binding.requestResponseLogging === 'disabled'
    && typeof binding.qualificationEvidenceRef === 'string' && binding.qualificationEvidenceRef.trim().length > 0;
}
