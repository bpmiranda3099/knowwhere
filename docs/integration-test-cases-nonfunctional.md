| Test Case Scenario ID | Test Case Scenario | Action | Actual Input | Expected Result |
|---|---|---|---|---|
| KN-NF-IT-01 | Integration run shuts down cleanly (no hanging processes) | Start the stack, make a few requests, then stop the stack | **Start**: `docker compose up -d` **Exercise**: open `http://localhost:3000/health` **Stop**: `docker compose down` | Containers stop cleanly (no stuck processes), and the stack can be brought up/down reliably |
| KN-NF-IT-02 | Integration checks avoid unintended external network calls | Run only against local services (no real internet dependency) | **Pre-step**: start only local containers you need (db/embedding/reranker/api/web) and ensure endpoints point to local containers (not public URLs) | Requests succeed without depending on public third-party APIs (arXiv/Crossref/OpenAlex/etc.) |

