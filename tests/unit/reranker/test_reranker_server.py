import importlib
import sys
import types

from fastapi.testclient import TestClient


def _install_fake_sentence_transformers(monkeypatch, scores=None):
  if scores is None:
    scores = [0.9]

  class FakeCrossEncoder:
    def __init__(self, model_name, trust_remote_code=True):
      self.model_name = model_name
      self.trust_remote_code = trust_remote_code
      self.last_pairs = None

    def predict(self, pairs):
      self.last_pairs = pairs

      class FakeArray:
        def __init__(self, data):
          self._data = data

        def tolist(self):
          return self._data

      return FakeArray(scores)

  fake_mod = types.SimpleNamespace(CrossEncoder=FakeCrossEncoder)
  monkeypatch.setitem(sys.modules, "sentence_transformers", fake_mod)


def test_reranker_health(monkeypatch):
  monkeypatch.setenv("MODEL_NAME", "unit-test-reranker")
  _install_fake_sentence_transformers(monkeypatch)

  sys.modules.pop("reranker.server", None)
  mod = importlib.import_module("reranker.server")

  client = TestClient(mod.app)
  res = client.get("/health")
  assert res.status_code == 200
  assert res.json()["status"] == "ok"
  assert res.json()["model"] == "unit-test-reranker"


def test_reranker_validates_documents(monkeypatch):
  _install_fake_sentence_transformers(monkeypatch)
  sys.modules.pop("reranker.server", None)
  mod = importlib.import_module("reranker.server")

  client = TestClient(mod.app)
  res = client.post("/rerank", json={"query": "q", "documents": []})
  assert res.status_code == 400
  assert "documents cannot be empty" in res.text


def test_reranker_returns_scores(monkeypatch):
  _install_fake_sentence_transformers(monkeypatch, scores=[0.1, 0.2])
  sys.modules.pop("reranker.server", None)
  mod = importlib.import_module("reranker.server")

  client = TestClient(mod.app)
  res = client.post("/rerank", json={"query": "q", "documents": ["a", "b"]})
  assert res.status_code == 200
  assert res.json() == {"scores": [0.1, 0.2]}

