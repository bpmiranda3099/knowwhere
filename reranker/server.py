import os
from typing import List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import CrossEncoder
import uvicorn

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
  scores = model.predict(pairs).tolist()
  return {"scores": scores}


if __name__ == "__main__":
  port = int(os.getenv("PORT", "8082"))
  uvicorn.run(app, host="0.0.0.0", port=port)
