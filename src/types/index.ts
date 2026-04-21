export type Mode = 'hybrid' | 'lexical' | 'semantic';
export type Level = 'paper' | 'chunk';

export interface SearchFilters {
  yearFrom?: number;
  yearTo?: number;
  venue?: string;
  subject?: string;
  source?: string;
}

export interface SearchRequest {
  q: string;
  limit?: number;
  mode?: Mode;
  level?: Level;
  filters?: SearchFilters;
  /**
   * Deprecated: reranking is always applied in normal operation.
   * In automated tests, reranking may be bypassed via SKIP_RERANK.
   */
  rerank?: boolean;
}

export interface SearchResult {
  id: string;
  title: string | null;
  abstract: string | null;
  doi: string | null;
  url: string | null;
  subjects: string[] | null;
  source: string | null;
  snippet: string | null;
  lexScore?: number | null;
  semScore?: number | null;
  hybridScore: number | null;
  chunkId?: number | null;
}
