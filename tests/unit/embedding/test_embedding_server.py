import importlib
import sys
import types

from fastapi.testclient import TestClient


def _install_fake_sentence_transformers(monkeypatch, embeddings=None):
  if embeddings is None:
    embeddings = [[0.1, 0.2]]

  class FakeSentenceTransformer:
    def __init__(self, model_name, trust_remote_code=True):
      self.model_name = model_name
      self.trust_remote_code = trust_remote_code

    def encode(self, texts, convert_to_numpy=True):
      class FakeArray:
        def __init__(self, data):
          self._data = data

        def tolist(self):
          return self._data

      return FakeArray(embeddings)

  fake_mod = types.SimpleNamespace(SentenceTransformer=FakeSentenceTransformer)
  monkeypatch.setitem(sys.modules, "sentence_transformers", fake_mod)


def test_embedding_health(monkeypatch):
  monkeypatch.setenv("MODEL_NAME", "unit-test-model")
  _install_fake_sentence_transformers(monkeypatch)

  # Ensure a fresh import (module loads model at import time).
  sys.modules.pop("embedding.server", None)
  mod = importlib.import_module("embedding.server")

  client = TestClient(mod.app)
  res = client.get("/health")
  assert res.status_code == 200
  assert res.json()["status"] == "ok"
  assert res.json()["model"] == "unit-test-model"


def test_embedding_embed_validation(monkeypatch):
  _install_fake_sentence_transformers(monkeypatch)
  sys.modules.pop("embedding.server", None)
  mod = importlib.import_module("embedding.server")

  client = TestClient(mod.app)
  res = client.post("/embed", json={"inputs": []})
  assert res.status_code == 400
  assert "inputs cannot be empty" in res.text


def test_embedding_embed_returns_embeddings(monkeypatch):
  _install_fake_sentence_transformers(monkeypatch, embeddings=[[1.0, 2.0], [3.0, 4.0]])
  sys.modules.pop("embedding.server", None)
  mod = importlib.import_module("embedding.server")

  client = TestClient(mod.app)
  res = client.post("/embed", json={"inputs": ["a", "b"]})
  assert res.status_code == 200
  assert res.json() == {"embeddings": [[1.0, 2.0], [3.0, 4.0]]}

