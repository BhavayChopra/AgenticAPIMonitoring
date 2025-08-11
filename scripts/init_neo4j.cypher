// Constraints
CREATE CONSTRAINT api_id IF NOT EXISTS FOR (n:API) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT endpoint_id IF NOT EXISTS FOR (n:Endpoint) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT doc_id IF NOT EXISTS FOR (n:Doc) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT incident_id IF NOT EXISTS FOR (n:Incident) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT fix_id IF NOT EXISTS FOR (n:Fix) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT run_id IF NOT EXISTS FOR (n:AgentRun) REQUIRE n.id IS UNIQUE;

// Sample API/Endpoint/Doc
MERGE (a:API {name:"Sample API"})
ON CREATE SET a.id = coalesce(a.id, randomUUID()), a.created_at = datetime()
WITH a
MERGE (e:Endpoint {path:"/v1/example", method:"GET"})-[:BELONGS_TO]->(a)
ON CREATE SET e.id = coalesce(e.id, randomUUID()), e.api_id = a.id, e.created_at = datetime()
WITH e
CREATE (d:Doc {
  id: randomUUID(),
  title: "Example Endpoint Doc",
  content: "GET /v1/example returns 200 with JSON body { ok: true }. Rate limit: 100 rpm. Timeout: 2000 ms.",
  created_at: datetime(),
  valid_from: datetime(),
  valid_to: null,
  version: "1.0.0"
})
MERGE (e)-[:HAS_DOC {valid_from: datetime(), valid_to: null}]->(d);


