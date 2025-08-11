/*
  API Sentinel — Core Workflow
  Orchestrates onIncident: persist incident, retrieve evidence, call LLM, persist fix & agent run.
*/

import { getGraphClient, GraphClient } from "./graph-client";
import { HybridRetriever } from "./retriever";
import { OllamaClient } from "./ollama";
import { sendSlackAlert } from "./slack";
import fetch from "node-fetch";
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

    let llmJson: LLMOutput;
    let rawResponse = "";
    let evidenceDocIds: string[] = [];
    const agentPyUrl = process.env.AGENTPY_URL;
    if (agentPyUrl) {
      // Delegate to Python advanced agent
      const res = await fetch(`${agentPyUrl.replace(/\/$/, "")}/run_incident`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`agentpy error ${res.status}: ${text}`);
      }
      const data: any = await res.json();
      rawResponse = JSON.stringify(data);
      llmJson = data?.result;
      if (!llmJson) throw new Error("agentpy did not return result field");
    } else {
      // Local TS path (retrieval + LLM)
      const docs = await this.graph.getDocsForEndpointAsOf(endpointId, incident.timestamp);
      const retrieval = await this.retriever.retrieve(
        this.buildQueryFromIncident(incident),
        docs
      );
      const evidencePassages = retrieval.passages.slice(0, 6).map((p) => ({ docId: p.docId, text: p.text }));
      evidenceDocIds = evidencePassages.map((e) => e.docId);
      const docsMetadata = docs.map((d) => ({
        id: d.id,
        title: d.title,
        version: d.version,
        valid_from: d.valid_from,
        valid_to: d.valid_to ?? null,
      }));
      const llmRes = await this.llm.generateDiagnosis(incident, evidencePassages, docsMetadata);
      rawResponse = llmRes.raw;
      llmJson = llmRes.json;
    }

    const runId = await this.graph.createAgentRun({
      inputs: { incident, evidenceDocIds },
      outputs: llmJson as any,
      executed_at: nowIso(),
      elapsed_ms: Date.now() - startedAt,
      status: "success",
      raw_llm_response: rawResponse,
    });

    const fixId = await this.graph.createFixAndLink(
      {
        incident_id: incidentId,
        suggested_by: opts?.agentId ?? "api-sentinel-agent",
        suggestion_text: llmJson.suggested_fix,
        patch_snippet: llmJson.patch_snippet ?? null,
        confidence: llmJson.confidence,
      },
      runId
    );

    // Slack alert when high severity or high confidence
    try {
      const shouldAlert =
        (incident.severity && ["high", "critical"].includes(incident.severity)) ||
        (llmJson.confidence >= CONFIDENCE_THRESHOLD);
      if (shouldAlert) {
        await sendSlackAlert({ fixId, incident, result: llmJson });
      }
    } catch (e) {
      // swallow slack errors
    }

    return { fixId, llm: llmJson };
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


