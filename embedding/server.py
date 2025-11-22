import os
from typing import List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import uvicorn

MODEL_NAME = os.getenv("MODEL_NAME", "BAAI/bge-base-en-v1.5")

app = FastAPI(title="Embedding Service", version="0.1.0")
model = SentenceTransformer(MODEL_NAME, trust_remote_code=True)


class EmbedRequest(BaseModel):
  model: str | None = None
  inputs: List[str]


@app.get("/health")
def health():
  return {"status": "ok", "model": MODEL_NAME}


@app.post("/embed")
def embed(req: EmbedRequest):
  texts = req.inputs
  if not texts:
    raise HTTPException(status_code=400, detail="inputs cannot be empty")
  embeddings = model.encode(texts, convert_to_numpy=True).tolist()
  return {"embeddings": embeddings}


if __name__ == "__main__":
  port = int(os.getenv("PORT", "8081"))
  uvicorn.run(app, host="0.0.0.0", port=port)
