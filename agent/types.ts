/*
  API Sentinel — Agent Types
  Shared type definitions for incidents, documents, evidence, fixes, and agent runs.
*/

export type Severity = "low" | "medium" | "high" | "critical";

export type Incident = {
  id?: string;
  api: string; // API name
  endpoint: string; // endpoint path, e.g., /v1/users
  method?: string; // HTTP method
  timestamp: string; // ISO 8601 string
  logs: string; // raw logs text
  status_code: number;
  latency: number; // ms
  severity?: Severity;
};

export type EvidenceType = "doc" | "incident";

export type EvidenceItem = {
  type: EvidenceType;
  id: string; // node id in graph
  excerpt: string; // text span for evidence
  passage_start?: number; // character offset start in doc
  passage_end?: number; // character offset end in doc
  log_line_numbers?: [number, number]; // start,end lines in logs
  score?: number; // ranking score
};

export type LLMOutput = {
  root_cause: string;
  confidence: number; // 0..1
  suggested_fix: string;
  patch_snippet?: string | null;
  evidence: EvidenceItem[];
  next_steps: string[];
  human_review_required?: boolean;
};

// Graph node representations (minimal fields for agent use)
export type ApiNode = {
  id: string;
  name: string;
  created_at?: string;
};

export type EndpointNode = {
  id: string;
  path: string;
  method?: string;
  api_id: string;
  current_status?: string;
  version?: string;
  created_at?: string;
};

export type DocNode = {
  id: string;
  title: string;
  content: string;
  source?: string;
  created_at?: string;
  valid_from?: string;
  valid_to?: string | null;
  version?: string;
  endpoint_id?: string;
};

export type FixNode = {
  id: string;
  incident_id: string;
  suggested_by: string; // agent id
  suggestion_text: string;
  patch_snippet?: string | null;
  created_at: string;
  applied_at?: string | null;
  confidence: number;
};

export type CommitOrPrNode = {
  id: string;
  repo: string;
  branch?: string;
  diff?: string;
  author?: string;
  created_at: string;
  merged_at?: string | null;
};

export type AgentRunNode = {
  id: string;
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  executed_at: string;
  elapsed_ms?: number;
  status?: "success" | "failure";
  raw_llm_response?: string; // for audit
};

export type RetrieverPassage = {
  docId: string;
  passageId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  score?: number;
};

export type RetrieverResult = {
  passages: RetrieverPassage[];
  usedBm25: boolean;
  usedVector: boolean;
};

// Utility helpers
export const CONFIDENCE_THRESHOLD: number = Number(
  process.env.CONFIDENCE_THRESHOLD ?? 0.6
);

export function nowIso(): string {
  return new Date().toISOString();
}

// Basic JSON validator for LLM output without extra deps.
export function validateLLMOutput(candidate: unknown): {
  ok: boolean;
  error?: string;
  value?: LLMOutput;
} {
  if (typeof candidate !== "object" || candidate === null) {
    return { ok: false, error: "not an object" };
  }
  const obj = candidate as Record<string, any>;
  const requiredKeys = [
    "root_cause",
    "confidence",
    "suggested_fix",
    "evidence",
    "next_steps",
  ];
  for (const key of requiredKeys) {
    if (!(key in obj)) {
      return { ok: false, error: `missing key ${key}` };
    }
  }
  if (typeof obj.root_cause !== "string") {
    return { ok: false, error: "root_cause must be string" };
  }
  const confNum = Number(obj.confidence);
  if (!Number.isFinite(confNum) || confNum < 0 || confNum > 1) {
    return { ok: false, error: "confidence must be 0..1" };
  }
  if (typeof obj.suggested_fix !== "string") {
    return { ok: false, error: "suggested_fix must be string" };
  }
  if (!Array.isArray(obj.evidence)) {
    return { ok: false, error: "evidence must be array" };
  }
  const evidence: EvidenceItem[] = [];
  for (const e of obj.evidence) {
    if (!e || typeof e !== "object") {
      return { ok: false, error: "evidence items must be objects" };
    }
    if (e.type !== "doc" && e.type !== "incident") {
      return { ok: false, error: "evidence.type must be doc|incident" };
    }
    if (typeof e.id !== "string" || typeof e.excerpt !== "string") {
      return { ok: false, error: "evidence.id/excerpt must be strings" };
    }
    evidence.push({
      type: e.type,
      id: e.id,
      excerpt: e.excerpt,
      passage_start: isFinite(e.passage_start) ? Number(e.passage_start) : undefined,
      passage_end: isFinite(e.passage_end) ? Number(e.passage_end) : undefined,
      log_line_numbers: Array.isArray(e.log_line_numbers)
        ? [Number(e.log_line_numbers[0]), Number(e.log_line_numbers[1])] as [number, number]
        : undefined,
      score: isFinite(e.score) ? Number(e.score) : undefined,
    });
  }
  if (!Array.isArray(obj.next_steps)) {
    return { ok: false, error: "next_steps must be array" };
  }
  const nextSteps = obj.next_steps.map((s: any) => String(s));
  const patchSnippet: string | null | undefined =
    obj.patch_snippet === undefined
      ? undefined
      : obj.patch_snippet === null
      ? null
      : String(obj.patch_snippet);

  const value: LLMOutput = {
    root_cause: obj.root_cause,
    confidence: confNum,
    suggested_fix: obj.suggested_fix,
    patch_snippet: patchSnippet,
    evidence,
    next_steps: nextSteps,
    human_review_required:
      typeof obj.human_review_required === "boolean"
        ? obj.human_review_required
        : confNum < CONFIDENCE_THRESHOLD,
  };
  return { ok: true, value };
}

export function ensureId(prefix: string = "id"): string {
  try {
    // Prefer Node's native UUID if available
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { randomUUID } = require("crypto");
    if (typeof randomUUID === "function") {
      return `${prefix}_${randomUUID()}`;
    }
  } catch {}
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}


