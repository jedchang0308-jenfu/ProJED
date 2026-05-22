import {
  RAG_EMBEDDING_DIMENSIONS,
  RAG_EMBEDDING_MODEL,
  RAG_EMBEDDING_PROVIDER,
  type RagEmbeddingInputDraft,
} from './ragContract';

export interface EmbeddingProvider {
  provider: typeof RAG_EMBEDDING_PROVIDER;
  model: typeof RAG_EMBEDDING_MODEL;
  dimensions: typeof RAG_EMBEDDING_DIMENSIONS;
  embed: (input: RagEmbeddingInputDraft) => Promise<number[]>;
}

export interface GeminiEmbeddingProviderOptions {
  apiKey: string;
  endpoint?: string;
}

interface GeminiEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
}

export const createGeminiEmbeddingProvider = ({
  apiKey,
  endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${RAG_EMBEDDING_MODEL}:embedContent`,
}: GeminiEmbeddingProviderOptions): EmbeddingProvider => {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required for Gemini embeddings.');
  }

  return {
    provider: RAG_EMBEDDING_PROVIDER,
    model: RAG_EMBEDDING_MODEL,
    dimensions: RAG_EMBEDDING_DIMENSIONS,
    embed: async input => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model: `models/${RAG_EMBEDDING_MODEL}`,
          content: { parts: [{ text: input.content }] },
          output_dimensionality: RAG_EMBEDDING_DIMENSIONS,
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini embedding request failed with HTTP ${response.status}.`);
      }

      const data = (await response.json()) as GeminiEmbeddingResponse;
      const values = data.embedding?.values;
      if (!Array.isArray(values) || values.length !== RAG_EMBEDDING_DIMENSIONS) {
        throw new Error(`Gemini embedding dimension mismatch. Expected ${RAG_EMBEDDING_DIMENSIONS}, got ${values?.length ?? 0}.`);
      }

      return values;
    },
  };
};
