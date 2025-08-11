/*
  API Sentinel — Ollama client wrapper
  Calls local Ollama (Llama 3.2) with structured prompts and returns parsed JSON.
*/

import { EvidenceItem, Incident, LLMOutput, validateLLMOutput } from "./types";

export type OllamaClientOptions = {
  host?: string;
  port?: string | number;
  model?: string;
  temperature?: number;
};

export class OllamaClient {
  private baseUrl: string;
  private model: string;
  private temperature: number;

  constructor(opts?: OllamaClientOptions) {
    const host = opts?.host ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1";
    const port = String(opts?.port ?? process.env.OLLAMA_PORT ?? 11434);
    this.baseUrl = `${host}:${port}`;
    this.model = opts?.model ?? process.env.OLLAMA_MODEL ?? "llama3.2";
    const suggestMode = (process.env.SUGGEST_MODE || "strict").toLowerCase();
    this.temperature = Number(
      opts?.temperature ?? (suggestMode === "explore" ? 0.2 : 0.0)
    );
  }

  async generateDiagnosis(
    incident: Incident,
    evidencePassages: Array<{ docId: string; text: string }>,
    docsMetadata: Array<{ id: string; title: string; version?: string; valid_from?: string; valid_to?: string | null }>,
    fewShots?: Array<{ incident: any; evidence: any[]; output: any }>
  ): Promise<{ raw: string; json: LLMOutput }>{
    const system = "You are API Sentinel Agent. Use logs, docs, and incident history. You must not hallucinate facts—if unsure, state uncertainty and recommend human review.";

    const schema = {
      type: "object",
      properties: {
        root_cause: { type: "string" },
        confidence: { type: "number" },
        suggested_fix: { type: "string" },
        patch_snippet: { type: ["string", "null"] },
        evidence: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { enum: ["doc", "incident"] },
              id: { type: "string" },
              excerpt: { type: "string" },
              passage_start: { type: ["number", "null"] },
              passage_end: { type: ["number", "null"] },
              log_line_numbers: { type: ["array", "null"], items: { type: "number" } },
              score: { type: ["number", "null"] },
            },
            required: ["type", "id", "excerpt"],
          },
        },
        next_steps: { type: "array", items: { type: "string" } },
        human_review_required: { type: ["boolean", "null"] },
      },
      required: ["root_cause", "confidence", "suggested_fix", "evidence", "next_steps"],
    };

    const promptParts: string[] = [];
    promptParts.push(`Incident: ${JSON.stringify(incident)}`);
    promptParts.push(
      `Docs metadata: ${JSON.stringify(
        docsMetadata.map((d) => ({ id: d.id, title: d.title, version: d.version, valid_from: d.valid_from, valid_to: d.valid_to }))
      )}`
    );
    const evidenceTexts = evidencePassages.map((p, i) => ({ index: i, docId: p.docId, text: p.text }));
    promptParts.push(`Evidence passages (max 6): ${JSON.stringify(evidenceTexts)}`);
    promptParts.push(
      "Answer constraints: Produce JSON strictly matching the schema fields. Do not include commentary. If uncertain, lower confidence and add human_review_required=true."
    );
    if (fewShots?.length) {
      promptParts.push(`Few-shot examples: ${JSON.stringify(fewShots).slice(0, 6000)} ...`);
    }
    const user = promptParts.join("\n\n");

    const body = {
      model: this.model,
      format: "json",
      options: { temperature: this.temperature },
      system,
      prompt: user,
      stream: false,
    } as any;

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error ${res.status}: ${text}`);
    }
    const data: any = await res.json();
    const raw = typeof data?.response === "string" ? data.response : JSON.stringify(data);
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // try to extract JSON substring
      const match = raw.match(/\{[\s\S]*\}$/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("LLM did not return valid JSON");
    }
    const validation = validateLLMOutput(parsed);
    if (!validation.ok) {
      throw new Error(`Invalid LLM JSON: ${validation.error}`);
    }
    return { raw, json: validation.value! };
  }
}


