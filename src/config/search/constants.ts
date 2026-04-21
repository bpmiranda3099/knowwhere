export const SEARCH_LIMITS = {
  default: 50,
  max: 100
};

export const SEARCH_VALIDATION = {
  queryMaxLength: 500,
  venueMaxLength: 200,
  subjectMaxLength: 100,
  sourceMaxLength: 50
};

export const SEARCH_CANDIDATES = {
  hybridLexical: 100,
  hybridSemantic: 100
};

export const SEARCH_WEIGHTS = {
  lexical: 0.25,
  semantic: 0.75
};

/** After SQL fusion, downrank stub metadata so semantic-only book/journal shells float below real papers. */
export const SEARCH_QUALITY = {
  /** Abstracts shorter than this (after trim) are treated as stubs unless strong lexical overlap exists. */
  stubAbstractMaxLen: 88,
  /** Multiply fused hybrid score when abstract looks like a catalog shell. */
  stubPenalty: 0.82,
  /** Matched with stubPenalty for thin rows that still lexically match generic query terms. */
  semanticOnlyStubExtra: 0.9,
  /** Small boost when both lexical and semantic signals exist (typical for on-topic technical hits). */
  lexicalSemanticBoost: 1.045
};

export const SNIPPET_LENGTH = 240;
