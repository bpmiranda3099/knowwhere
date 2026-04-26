| Test Case Scenario ID | Test Case Scenario | Action | Actual Input | Expected Result |
|---|---|---|---|---|
| KN-F-SM-01 | API health endpoint responds | Open the API health page | **Website/URL**: `http://localhost:3000/health?services=api` | The page responds successfully (status is OK) |
| KN-F-SM-02 | API ready endpoint responds | Open the API ready page | **Website/URL**: `http://localhost:3000/ready` | The page responds successfully (status is OK) |
| KN-F-SM-03 | Search request can be submitted and returns a response | Submit a search request | **Where**: API client (Postman/Insomnia/curl) **URL**: `http://localhost:3000/search` **Body**: `{ "q": "hello" }` | You receive a successful response and it contains a `results` list |
| KN-F-SM-04 | Embed request can be submitted and returns a response | Submit an embed request | **Where**: API client (Postman/Insomnia/curl) **URL**: `http://localhost:3000/embed` **Body**: `{ "texts": ["hello"] }` | You receive a successful response and it contains embeddings |
| KN-F-SM-05 | Rerank request can be submitted and returns a response | Submit a rerank request | **Where**: API client (Postman/Insomnia/curl) **URL**: `http://localhost:3000/rerank` **Body**: `{ "query": "q", "documents": ["a","b"] }` | You receive a successful response and it contains scores |
| KN-F-SM-06 | Ingest request can be submitted and returns an accepted response | Submit an ingest request | **Where**: API client (Postman/Insomnia/curl) **URL**: `http://localhost:3000/ingest` **Body**: `{ "source": "arxiv", "query": "cat:cs.CL", "count": 1 }` | The API accepts the request and returns an “accepted/started” response (includes a job PID) |
| KN-F-SM-07 | Stats page responds | Open the stats endpoint | **Website/URL**: `http://localhost:3000/stats` | The endpoint responds successfully and returns counts |
| KN-F-SM-08 | Logs page responds | Open the logs endpoint | **Website/URL**: `http://localhost:3000/logs?limit=1` | The endpoint responds successfully and returns a list of logs |

