/*
  API Sentinel — Graph Client
  Neo4j client with temporal helpers and an in-memory fallback.
*/

import neo4j, { Driver, Session } from "neo4j-driver";
import {
  AgentRunNode,
  DocNode,
  EndpointNode,
  FixNode,
  Incident,
  nowIso,
  ensureId,
} from "./types";

export interface GraphClient {
  upsertApiAndEndpoint(apiName: string, endpointPath: string, method?: string): Promise<{
    apiId: string;
    endpointId: string;
  }>;

  createIncident(incident: Incident, endpointId: string): Promise<string>; // returns incident id

  getDocsForEndpointAsOf(endpointId: string, asOfIso: string): Promise<DocNode[]>;

  createAgentRun(run: Omit<AgentRunNode, "id">): Promise<string>;

  createFixAndLink(
    fix: Omit<FixNode, "id" | "created_at">,
    agentRunId: string
  ): Promise<string>; // fix id
}

export class Neo4jGraphClient implements GraphClient {
  private driver: Driver;

  constructor(uri: string, username: string, password: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  }

  private async run<T = any>(cypher: string, params: Record<string, any> = {}): Promise<T[]> {
    const session: Session = this.driver.session();
    try {
      const res = await session.run(cypher, params);
      return res.records.map((r) => r.toObject() as any);
    } finally {
      await session.close();
    }
  }

  async upsertApiAndEndpoint(apiName: string, endpointPath: string, method?: string): Promise<{ apiId: string; endpointId: string; }> {
    const now = nowIso();
    const records = await this.run(
      `MERGE (a:API { name: $apiName })
       ON CREATE SET a.id = coalesce(a.id, randomUUID()), a.created_at = $now
       WITH a
       MERGE (e:Endpoint { path: $endpointPath })-[:BELONGS_TO]->(a)
       ON CREATE SET e.id = coalesce(e.id, randomUUID()), e.method = $method, e.api_id = a.id, e.created_at = $now
       SET e.method = coalesce($method, e.method)
       RETURN a.id AS apiId, e.id AS endpointId`,
      { apiName, endpointPath, method, now }
    );
    const row = records[0] as any;
    return { apiId: row.apiId, endpointId: row.endpointId };
  }

  async createIncident(incident: Incident, endpointId: string): Promise<string> {
    const id = ensureId("incident");
    const detectedAt = incident.timestamp;
    await this.run(
      `MATCH (e:Endpoint { id: $endpointId })
       CREATE (i:Incident {
         id: $id,
         api: $api,
         endpoint: $endpoint,
         method: $method,
         status_code: $status_code,
         latency: $latency,
         logs: $logs,
         detected_at: $detected_at,
         severity: $severity,
         created_at: $now
       })
       MERGE (e)-[:HAD_INCIDENT]->(i)`,
      {
        endpointId,
        id,
        api: incident.api,
        endpoint: incident.endpoint,
        method: incident.method ?? null,
        status_code: incident.status_code,
        latency: incident.latency,
        logs: incident.logs,
        detected_at: detectedAt,
        severity: incident.severity ?? null,
        now: nowIso(),
      }
    );
    return id;
  }

  async getDocsForEndpointAsOf(endpointId: string, asOfIso: string): Promise<DocNode[]> {
    const rows = await this.run(
      `MATCH (e:Endpoint { id: $endpointId })-[:HAS_DOC]->(d:Doc)
       WHERE (coalesce(d.valid_from, datetime('1970-01-01')) <= datetime($asOf))
         AND (d.valid_to IS NULL OR datetime(d.valid_to) > datetime($asOf))
       RETURN d
       ORDER BY d.created_at DESC`,
      { endpointId, asOf: asOfIso }
    );
    return rows.map((r: any) => {
      const d = (r.d as any).properties as any;
      return {
        id: d.id ?? ensureId("doc"),
        title: d.title,
        content: d.content,
        source: d.source ?? undefined,
        created_at: d.created_at ?? undefined,
        valid_from: d.valid_from ?? undefined,
        valid_to: d.valid_to ?? undefined,
        version: d.version ?? undefined,
        endpoint_id: endpointId,
      } as DocNode;
    });
  }

  async createAgentRun(run: Omit<AgentRunNode, "id">): Promise<string> {
    const id = ensureId("run");
    await this.run(
      `CREATE (ar:AgentRun {
        id: $id,
        inputs: $inputs,
        outputs: $outputs,
        executed_at: $executed_at,
        elapsed_ms: $elapsed_ms,
        status: $status,
        raw_llm_response: $raw
      })`,
      {
        id,
        inputs: run.inputs,
        outputs: run.outputs ?? null,
        executed_at: run.executed_at,
        elapsed_ms: run.elapsed_ms ?? null,
        status: run.status ?? null,
        raw: run.raw_llm_response ?? null,
      }
    );
    return id;
  }

  async createFixAndLink(
    fix: Omit<FixNode, "id" | "created_at">,
    agentRunId: string
  ): Promise<string> {
    const id = ensureId("fix");
    const createdAt = nowIso();
    await this.run(
      `MATCH (i:Incident { id: $incidentId })
       MATCH (ar:AgentRun { id: $agentRunId })
       CREATE (f:Fix {
         id: $id,
         incident_id: $incidentId,
         suggested_by: $suggested_by,
         suggestion_text: $suggestion_text,
         patch_snippet: $patch_snippet,
         created_at: $created_at,
         applied_at: $applied_at,
         confidence: $confidence
       })
       MERGE (i)-[:HAVE_FIX]->(f)
       MERGE (f)-[:PROPOSED_BY]->(ar)`,
      {
        id,
        incidentId: fix.incident_id,
        agentRunId,
        suggested_by: fix.suggested_by,
        suggestion_text: fix.suggestion_text,
        patch_snippet: fix.patch_snippet ?? null,
        created_at: createdAt,
        applied_at: null,
        confidence: fix.confidence,
      }
    );
    return id;
  }
}

// In-memory fallback for environments without Neo4j
export class InMemoryGraphClient implements GraphClient {
  private apis: Map<string, { id: string; name: string }> = new Map();
  private endpoints: Map<string, EndpointNode> = new Map();
  private docs: DocNode[] = [];
  private incidents: Map<string, any> = new Map();
  private runs: Map<string, AgentRunNode> = new Map();
  private fixes: Map<string, FixNode> = new Map();

  constructor() {
    // seed with example doc
    const apiId = ensureId("api");
    const endpointId = ensureId("endpoint");
    this.apis.set("Sample API", { id: apiId, name: "Sample API" });
    this.endpoints.set(endpointId, {
      id: endpointId,
      api_id: apiId,
      path: "/v1/example",
      method: "GET",
      created_at: nowIso(),
    });
    this.docs.push({
      id: ensureId("doc"),
      title: "Example Endpoint Doc",
      content:
        "GET /v1/example returns 200 with JSON body { ok: true }. Rate limit: 100 rpm. Timeout: 2000 ms.",
      created_at: nowIso(),
      valid_from: nowIso(),
      valid_to: null,
      endpoint_id: endpointId,
      version: "1.0.0",
    });
  }

  async upsertApiAndEndpoint(apiName: string, endpointPath: string, method?: string): Promise<{ apiId: string; endpointId: string; }> {
    let api = Array.from(this.apis.values()).find((a) => a.name === apiName);
    if (!api) {
      api = { id: ensureId("api"), name: apiName };
      this.apis.set(apiName, api);
    }
    let endpoint = Array.from(this.endpoints.values()).find(
      (e) => e.path === endpointPath && (!method || e.method === method)
    );
    if (!endpoint) {
      endpoint = {
        id: ensureId("endpoint"),
        api_id: api.id,
        path: endpointPath,
        method,
        created_at: nowIso(),
      } as EndpointNode;
      this.endpoints.set(endpoint.id, endpoint);
    }
    return { apiId: api.id, endpointId: endpoint.id };
  }

  async createIncident(incident: Incident, endpointId: string): Promise<string> {
    const id = ensureId("incident");
    this.incidents.set(id, { ...incident, id, endpointId, created_at: nowIso() });
    return id;
  }

  async getDocsForEndpointAsOf(endpointId: string, asOfIso: string): Promise<DocNode[]> {
    const t = new Date(asOfIso).getTime();
    return this.docs.filter((d) => {
      if (d.endpoint_id !== endpointId) return false;
      const from = d.valid_from ? new Date(d.valid_from).getTime() : 0;
      const to = d.valid_to ? new Date(d.valid_to).getTime() : Infinity;
      return from <= t && t < to;
    });
  }

  async createAgentRun(run: Omit<AgentRunNode, "id">): Promise<string> {
    const id = ensureId("run");
    const node: AgentRunNode = { id, ...run } as AgentRunNode;
    this.runs.set(id, node);
    return id;
  }

  async createFixAndLink(
    fix: Omit<FixNode, "id" | "created_at">,
    _agentRunId: string
  ): Promise<string> {
    const id = ensureId("fix");
    const node: FixNode = {
      id,
      incident_id: fix.incident_id,
      suggested_by: fix.suggested_by,
      suggestion_text: fix.suggestion_text,
      patch_snippet: fix.patch_snippet ?? null,
      created_at: nowIso(),
      applied_at: null,
      confidence: fix.confidence,
    };
    this.fixes.set(id, node);
    return id;
  }
}

export function getGraphClient(): GraphClient {
  const uri = process.env.NEO4J_URI;
  if (uri) {
    const username = process.env.NEO4J_USERNAME || "neo4j";
    const password = process.env.NEO4J_PASSWORD || "neo4j";
    return new Neo4jGraphClient(uri, username, password);
  }
  return new InMemoryGraphClient();
}


