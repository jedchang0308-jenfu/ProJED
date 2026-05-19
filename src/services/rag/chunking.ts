import {
  RAG_CHUNK_OVERLAP_CHARS,
  RAG_CHUNK_TARGET_CHARS,
  type RagChunkDraft,
  type RagCitation,
} from './ragContract';

export interface ChunkTextOptions {
  tenantId: string;
  sourceDocumentId: string;
  content: string;
  citation: RagCitation;
  sourceContentHash: string;
  targetChars?: number;
  overlapChars?: number;
}

const normalizeContent = (content: string): string =>
  content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const estimateTokenCount = (content: string): number => {
  const normalized = normalizeContent(content);
  if (!normalized) return 0;

  const latinWords = normalized.match(/[A-Za-z0-9_'-]+/g)?.length ?? 0;
  const cjkChars = normalized.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const punctuation = normalized.match(/[^\sA-Za-z0-9_'\-\u3400-\u9fff]/g)?.length ?? 0;

  return Math.max(1, Math.ceil(latinWords * 1.25 + cjkChars * 0.8 + punctuation * 0.25));
};

const findChunkEnd = (content: string, start: number, targetEnd: number, targetChars: number): number => {
  if (targetEnd >= content.length) return content.length;

  const sentenceBreak = Math.max(
    content.lastIndexOf('\n\n', targetEnd),
    content.lastIndexOf('。', targetEnd),
    content.lastIndexOf('.', targetEnd),
  );

  if (sentenceBreak > start + Math.floor(targetChars * 0.45)) {
    return sentenceBreak + 1;
  }

  const wordBreak = content.lastIndexOf(' ', targetEnd);
  if (wordBreak > start + Math.floor(targetChars * 0.6)) {
    return wordBreak;
  }

  return targetEnd;
};

export const chunkText = ({
  tenantId,
  sourceDocumentId,
  content,
  citation,
  sourceContentHash,
  targetChars = RAG_CHUNK_TARGET_CHARS,
  overlapChars = RAG_CHUNK_OVERLAP_CHARS,
}: ChunkTextOptions): RagChunkDraft[] => {
  const normalized = normalizeContent(content);
  if (!normalized) return [];

  const chunks: RagChunkDraft[] = [];
  let start = 0;

  while (start < normalized.length) {
    const targetEnd = Math.min(start + targetChars, normalized.length);
    const end = findChunkEnd(normalized, start, targetEnd, targetChars);
    const chunkContent = normalized.slice(start, end).trim();

    if (chunkContent) {
      chunks.push({
        tenantId,
        sourceDocumentId,
        chunkIndex: chunks.length,
        content: chunkContent,
        estimatedTokenCount: estimateTokenCount(chunkContent),
        metadata: {
          citation,
          sourceContentHash,
          startChar: start,
          endChar: end,
        },
      });
    }

    if (end >= normalized.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
};
