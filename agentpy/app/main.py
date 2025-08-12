from fastapi import FastAPI, HTTPException
from typing import Optional
import os

from .dashboard import router as dashboard_router
from .schemas import RunIncidentRequest, AgentResult
from .agent import AgenticWorkflow

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
  try:
    agent = AgenticWorkflow()
    result: AgentResult = agent.run(req.incident)
    return {"result": result.model_dump(), "traces": []}
  except Exception as e:
    raise HTTPException(500, str(e))


