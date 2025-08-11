/*
  API Sentinel — Core Workflow
  Orchestrates onIncident: persist incident, retrieve evidence, call LLM, persist fix & agent run.
*/

import { getGraphClient, GraphClient } from "./graph-client";
import { HybridRetriever } from "./retriever";
import { OllamaClient } from "./ollama";
import {
  Incident,
  nowIso,
  LLMOutput,
  CONFIDENCE_THRESHOLD,
  EvidenceItem,
} from "./types";

export type OnIncidentOptions = {
  autoFix?: boolean;
  agentId?: string;
};

export class AgentWorkflow {
  private graph: GraphClient;
  private retriever: HybridRetriever;
  private llm: OllamaClient;

  constructor(graph?: GraphClient, retriever?: HybridRetriever, llm?: OllamaClient) {
    this.graph = graph ?? getGraphClient();
    this.retriever = retriever ?? new HybridRetriever();
    this.llm = llm ?? new OllamaClient();
  }

  async onIncident(incident: Incident, opts?: OnIncidentOptions): Promise<{ fixId: string; llm: LLMOutput }>{
    const startedAt = Date.now();
    const { api, endpoint, method } = incident;
    const { apiId, endpointId } = await this.graph.upsertApiAndEndpoint(api, endpoint, method);

    const incidentId = await this.graph.createIncident(incident, endpointId);

    const docs = await this.graph.getDocsForEndpointAsOf(endpointId, incident.timestamp);
    const retrieval = await this.retriever.retrieve(
      this.buildQueryFromIncident(incident),
      docs
    );

    const evidencePassages = retrieval.passages.slice(0, 6).map((p) => ({ docId: p.docId, text: p.text }));
    const docsMetadata = docs.map((d) => ({
      id: d.id,
      title: d.title,
      version: d.version,
      valid_from: d.valid_from,
      valid_to: d.valid_to ?? null,
    }));

    const llmRes = await this.llm.generateDiagnosis(incident, evidencePassages, docsMetadata);

    const runId = await this.graph.createAgentRun({
      inputs: { incident, evidenceDocIds: evidencePassages.map((e) => e.docId) },
      outputs: llmRes.json as any,
      executed_at: nowIso(),
      elapsed_ms: Date.now() - startedAt,
      status: "success",
      raw_llm_response: llmRes.raw,
    });

    const fixId = await this.graph.createFixAndLink(
      {
        incident_id: incidentId,
        suggested_by: opts?.agentId ?? "api-sentinel-agent",
        suggestion_text: llmRes.json.suggested_fix,
        patch_snippet: llmRes.json.patch_snippet ?? null,
        confidence: llmRes.json.confidence,
      },
      runId
    );

    return { fixId, llm: llmRes.json };
  }

  private buildQueryFromIncident(incident: Incident): string {
    const lines = [
      `endpoint: ${incident.method ?? ""} ${incident.endpoint}`.trim(),
      `status_code: ${incident.status_code}`,
      `latency_ms: ${incident.latency}`,
      `logs: ${incident.logs.slice(0, 2000)}`,
    ];
    return lines.join("\n");
  }
}


