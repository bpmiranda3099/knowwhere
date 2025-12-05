## IR Testing (Phase II alignment)

Objective: validate retrieval quality and performance against user pain points (semantic gap, noisy/OCR, faster lookup) and produce evidence for ISO 25010 traits (functional suitability, performance efficiency, reliability, compatibility, security).

### Assets
- Ground truth query set: `tests/ir-metrics/queries.json` (buckets: keyword, conceptual, longtail, noisy). Replace `relevantIds` with IDs present in your DB; keep buckets and `needTag` to preserve traceability to user needs.
- Baselines: BM25 (`lexical`), semantic-only (`semantic`), hybrid (`hybrid`).
- Splits are documented per query (`split` optional). Keep the same file across modes/runs for comparability.

### Environment
- Container stack (`docker-compose up -d`) with DB + pgvector, embedding, reranker, API, frontend. Pin model IDs via `.env` (`EMBEDDING_MODEL`, reranker).
- Seeds and rate limits set via `.env`; script respects `PHASE2_BASE_URL`, `PHASE2_API_KEY`, `PHASE2_TIMEOUT_MS`.

### Running the suite
```bash
# update tests/ir-metrics/queries.json with real ids first
npm run eval:phase2 -- --baseUrl http://localhost:3000 --runs 3 --k 5,10 --batchSize 6 --level paper
# optional flags:
#   --dataset ./path/to/queries.json
#   --modes hybrid,lexical,semantic
#   --seed 123 --warmups 1 --timeout 20000
```

Outputs go to `tests/ir-metrics/results/phase2-<timestamp>.json` and include:
- Per-mode/per-bucket Precision@k, Recall@k, MRR with bootstrap CIs and coverage of ground truth hits.
- Latency percentiles (p50/p90/p95/p99), throughput (QPS), error rate; correlation of latency vs MRR to expose trade-offs.
- Significance checks: Wilcoxon vs BM25, Friedman for multi-system comparisons, effect-size style lifts.
- Acceptance gates (configurable in dataset meta): Precision@5 lift over BM25, p95 latency target, noisy/OCR drop tolerance.
- Security checks: API key enforcement + rate limiting probes recorded in the result JSON.

### Validity controls
- Same query set across systems; randomized order per run (`--seed` reproducible); repeated runs (default 3).
- Batch size simulates expected traffic; warmups prime cache/embeddings.
- Bootstrap CIs (non-normal friendly), per-bucket slices (noisy vs clean) to watch regressions.
- Logs include config, model IDs (from env), splits, and timestamps for reproducibility.

### Phase III alignment (ISO 25010 cues)
- Functional suitability: Precision/Recall/MRR vs baselines; per-bucket coverage.
- Performance efficiency: latency percentiles, throughput, resource snapshots.
- Reliability: error rate + timeout rate (from request errors).
- Compatibility: same suite runs across deployments (`--baseUrl` swap).
- Security: API key enforcement + rate limiting probes recorded in the result JSON.

### Next steps after a run
- Plot precision/recall curves and latency CDFs from the JSON (drop into a notebook or your analytics stack).
- Feed gains/regressions back to sprint work; Phase III surveys can reference the trade-offs surfaced (e.g., latency vs MRR correlation).
