from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os

from anthropic import Anthropic
from .dashboard import router as dashboard_router

app = FastAPI(title="API Sentinel AgentPy")
app.include_router(dashboard_router)


class EvidenceItem(BaseModel):
  type: str
  id: str
  excerpt: str
  passage_start: Optional[int] = None
  passage_end: Optional[int] = None
  log_line_numbers: Optional[List[int]] = None
  score: Optional[float] = None


class LLMOutput(BaseModel):
  root_cause: str
  confidence: float
  suggested_fix: str
  patch_snippet: Optional[str] = None
  evidence: List[EvidenceItem]
  next_steps: List[str]
  human_review_required: Optional[bool] = None


class Incident(BaseModel):
  api: str
  endpoint: str
  method: Optional[str] = None
  timestamp: str
  logs: str
  status_code: int
  latency: int
  severity: Optional[str] = None


class RunIncidentRequest(BaseModel):
  incident: Incident


@app.get("/health")
def health():
  return {"ok": True}


@app.post("/run_incident")
def run_incident(req: RunIncidentRequest):
  api_key = os.environ.get("ANTHROPIC_API_KEY")
  if not api_key:
    raise HTTPException(500, "ANTHROPIC_API_KEY not set")
  client = Anthropic(api_key=api_key)
  model = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-sonnet-20240620")

  system = "You are API Sentinel Agent. Use logs, docs, and incident history. Do not hallucinate. Respond with strict JSON."
  user = f"Incident: {req.incident.model_dump_json()}\nReturn JSON with keys: root_cause, confidence, suggested_fix, patch_snippet, evidence, next_steps."

  resp = client.messages.create(
    model=model,
    max_tokens=800,
    temperature=0.0,
    system=system,
    messages=[{"role":"user","content": user}]
  )
  # Parse JSON content
  text = ""
  for block in resp.content:
    if block.type == "text":
      text += block.text
  import json
  try:
    data = json.loads(text)
  except Exception:
    raise HTTPException(500, "Claude did not return valid JSON")

  # Basic normalization to schema
  result = LLMOutput(**{
    "root_cause": data.get("root_cause", ""),
    "confidence": float(data.get("confidence", 0)),
    "suggested_fix": data.get("suggested_fix", ""),
    "patch_snippet": data.get("patch_snippet"),
    "evidence": [
      EvidenceItem(
        type=e.get("type","incident"),
        id=str(e.get("id","unknown")),
        excerpt=e.get("excerpt","")
      ) for e in data.get("evidence", [])
    ],
    "next_steps": data.get("next_steps", [])
  })
  return {"result": result.model_dump(), "traces": []}


