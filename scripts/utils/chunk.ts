import { INGEST_DEFAULTS } from '../../src/config/ingest/constants';

export function chunkText(
  text: string,
  maxWords = INGEST_DEFAULTS.chunkWords,
  overlap = INGEST_DEFAULTS.chunkOverlap
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + maxWords);
    if (slice.length === 0) break;
    chunks.push(slice.join(' '));
    i += Math.max(1, maxWords - overlap);
  }
  return chunks;
}
