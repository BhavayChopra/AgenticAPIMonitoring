## Few-shot Examples

Example 1: Timeout spike due to doc-config mismatch
Input
```json
{
  "api": "Payments API",
  "endpoint": "/v1/charges",
  "method": "POST",
  "timestamp": "2025-07-01T12:30:00Z",
  "logs": "upstream timeout after 2100ms; retry=0",
  "status_code": 504,
  "latency": 2105
}
```
Evidence
```json
[
  {"docId":"doc-1","text":"Timeout: 2000 ms. Retries: 2."}
]
```
Output
```json
{
  "root_cause": "Gateway timeout slightly above documented 2000 ms limit with zero retries configured in runtime",
  "confidence": 0.82,
  "suggested_fix": "Increase upstream client timeout to 2500 ms and enable 2 retries with exponential backoff",
  "patch_snippet": "config.http.timeout=2500\nconfig.http.retries=2",
  "evidence": [{"type":"doc","id":"doc-1","excerpt":"Timeout: 2000 ms. Retries: 2."}],
  "next_steps": ["Deploy config changes", "Monitor P95 latency"]
}
```

Example 2: 429 due to rate limit
Input
```json
{"api":"Users API","endpoint":"/v1/users","timestamp":"2025-06-10T08:00:00Z","logs":"429 too many requests","status_code":429,"latency":60}
```
Evidence
```json
[{"docId":"doc-5","text":"Rate limit: 100 rpm per API key"}]
```
Output
```json
{"root_cause":"Burst exceeded 100 rpm limit","confidence":0.78,"suggested_fix":"Apply client-side rate limiter to 90 rpm average with jitter","patch_snippet":null,"evidence":[{"type":"doc","id":"doc-5","excerpt":"Rate limit: 100 rpm per API key"}],"next_steps":["Coordinate with client to throttle traffic"]}
```

Example 3: Schema mismatch 400
Input
```json
{"api":"Catalog","endpoint":"/v2/items","method":"POST","timestamp":"2025-05-12T10:00:00Z","logs":"invalid field 'sku_id'","status_code":400,"latency":30}
```
Evidence
```json
[{"docId":"doc-9","text":"Request field: sku (string)."}]
```
Output
```json
{"root_cause":"Client sent 'sku_id' but API expects 'sku'","confidence":0.88,"suggested_fix":"Map sku_id->sku in request payload","patch_snippet":"payload.sku = payload.sku_id; delete payload.sku_id;","evidence":[{"type":"doc","id":"doc-9","excerpt":"Request field: sku (string)."}],"next_steps":["Validate with contract tests"]}
```


