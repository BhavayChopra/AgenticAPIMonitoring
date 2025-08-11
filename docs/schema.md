## Knowledge Graph Schema (Temporal)

Nodes
- API { id, name, created_at }
- Endpoint { id, path, method, api_id, current_status, version, created_at }
- Doc { id, title, content, source, created_at, valid_from, valid_to, version }
- Incident { id, api, endpoint, method, status_code, latency, logs, detected_at, severity, created_at }
- Fix { id, incident_id, suggested_by, suggestion_text, patch_snippet, created_at, applied_at, confidence }
- Commit { id, repo, branch, diff, author, created_at, merged_at }
- AgentRun { id, inputs, outputs, executed_at, elapsed_ms, status, raw_llm_response }

Relationships
- (API)-[:HAS_ENDPOINT]->(Endpoint)
- (Endpoint)-[:HAS_DOC {valid_from, valid_to}]->(Doc)
- (Endpoint)-[:HAD_INCIDENT]->(Incident)
- (Incident)-[:HAVE_FIX]->(Fix)
- (Fix)-[:PROPOSED_BY]->(AgentRun)
- (Fix)-[:RESULTED_IN]->(Commit)

Temporal Filters
- Current docs: valid_from <= now() and (valid_to is null or valid_to > now())
- Docs as-of T: valid_from <= T and (valid_to is null or valid_to > T)
- Recent incidents: detected_at >= now()-30d

### Indexes (Neo4j Cypher)
```cypher
CREATE CONSTRAINT api_id IF NOT EXISTS FOR (n:API) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT endpoint_id IF NOT EXISTS FOR (n:Endpoint) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT doc_id IF NOT EXISTS FOR (n:Doc) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT incident_id IF NOT EXISTS FOR (n:Incident) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT fix_id IF NOT EXISTS FOR (n:Fix) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT run_id IF NOT EXISTS FOR (n:AgentRun) REQUIRE n.id IS UNIQUE;
```

### Example Queries
Current doc for an endpoint
```cypher
MATCH (:API {name:$api})-[:HAS_ENDPOINT]->(e:Endpoint {path:$path})-[:HAS_DOC]->(d:Doc)
WHERE coalesce(d.valid_from, datetime('1970-01-01')) <= datetime()
  AND (d.valid_to IS NULL OR datetime(d.valid_to) > datetime())
RETURN d ORDER BY d.created_at DESC LIMIT 1;
```

Docs as-of incident time
```cypher
MATCH (e:Endpoint {id:$endpointId})-[:HAS_DOC]->(d:Doc)
WHERE coalesce(d.valid_from, datetime('1970-01-01')) <= datetime($asOf)
  AND (d.valid_to IS NULL OR datetime(d.valid_to) > datetime($asOf))
RETURN d ORDER BY d.created_at DESC;
```

Recent incidents (30 days)
```cypher
MATCH (e:Endpoint {id:$endpointId})-[:HAD_INCIDENT]->(i:Incident)
WHERE datetime(i.detected_at) >= datetime() - duration('P30D')
RETURN i ORDER BY i.detected_at DESC;
```


