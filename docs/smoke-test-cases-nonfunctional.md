| Test Case Scenario ID | Test Case Scenario | Action | Actual Input | Expected Result |
|---|---|---|---|---|
| KN-NF-SM-01 | API responds quickly for health checks | Open the health endpoint and observe responsiveness | **URL**: `http://localhost:3000/health?services=api` | Response comes back quickly (no “hang”); suitable for a quick deployment check |
| KN-NF-SM-02 | Web pages load without obvious rendering errors | Open the home page and search page in a browser | **Pages**: `http://localhost:8080/web/index.html`, `http://localhost:8080/web/test.html` | Pages load without blank screens or obvious layout breakage |

