import logging
import os
from typing import List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import CrossEncoder
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_NAME = os.getenv("MODEL_NAME", "BAAI/bge-reranker-base")

app = FastAPI(title="Reranker Service", version="0.1.0")
model = CrossEncoder(MODEL_NAME, trust_remote_code=True)


class RerankRequest(BaseModel):
  query: str
  documents: List[str]


@app.get("/health")
def health():
  return {"status": "ok", "model": MODEL_NAME}


@app.post("/rerank")
def rerank(req: RerankRequest):
  if not req.documents:
    raise HTTPException(status_code=400, detail="documents cannot be empty")
  pairs = [[req.query, doc] for doc in req.documents]
  try:
    scores = model.predict(pairs).tolist()
    return {"scores": scores}
  except Exception as e:
    logger.exception("rerank inference failed (query_len=%s n_docs=%s)", len(req.query), len(req.documents))
    raise HTTPException(status_code=503, detail=f"rerank inference failed: {e}") from e


if __name__ == "__main__":
  port = int(os.getenv("PORT", "8082"))  # pragma: no cover
  uvicorn.run(app, host="0.0.0.0", port=port)  # pragma: no cover
