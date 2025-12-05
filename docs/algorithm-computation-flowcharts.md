## Embedding (text to vector)
```mermaid
flowchart TD
  A[Start] --> B[Tokenize text to IDs]
  B --> C[Lookup token embeddings]
  C --> D[Add positional encodings]
  D --> E[Transformer layers mix context]
  E --> F[Pool to single vector CLS or mean]
  F --> G[L2 normalize vector e_hat]
  G --> H[End]
```

## Lexical scorer (BM25)
```mermaid
flowchart TD
  A[Start] --> B[Receive query terms and document]
  B --> C[Compute term frequency f t d]
  C --> D[Measure document length d and avgdl]
  D --> E[Lookup IDF per term]
  E --> F[Apply BM25 formula with k1 and b]
  F --> G[Return BM25 score]
  G --> H[End]
```

## Dense retriever (cosine similarity)
```mermaid
flowchart TD
  A[Start] --> B[Embed query to vector e_q]
  A2[Embed passage to vector e_p] --> C
  B --> C[Normalize both vectors]
  C --> D[Compute cosine sim dot product]
  D --> E[Return similarity score]
  E --> F[End]
```

## Hybrid fusion (lexical + dense)
```mermaid
flowchart TD
  A[Start] --> B[Input normalized BM25 score]
  A2[Input normalized cosine score] --> C
  B --> C{Blend with alpha}
  C --> D[score_hybrid = alpha * BM25_norm + (1 - alpha) * sim_norm]
  D --> E[Return fused score]
  E --> F[End]
```

## Cross encoder reranker
```mermaid
flowchart TD
  A[Start] --> B[Receive query and candidate passages]
  B --> C[For each passage build joint input CLS query SEP passage SEP]
  C --> D[Run cross encoder to get score s q p]
  D --> E[Collect scores for all candidates]
  E --> F[Sort candidates by score descending]
  F --> G[Output reranked list]
  G --> H[End]
```

## Evaluation metrics
```mermaid
flowchart TD
  A[Start] --> B[Input ground truth relevant set]
  A2[Input retrieved ranked list] --> C
  B --> C[Intersect relevant and retrieved]
  C --> D[Compute Precision at k = hits in top k divided by k]
  C --> E[Compute Recall at k = hits in top k divided by total relevant]
  C --> F[Find rank of first relevant for each query]
  F --> G[Compute MRR = average of 1 over rank_i]
  D --> H[Report metrics]
  E --> H
  G --> H
  H --> I[End]
```
