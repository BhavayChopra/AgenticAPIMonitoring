from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class Incident(BaseModel):
  api: str
  endpoint: str
  method: Optional[str] = None
  timestamp: str
  logs: str
  status_code: int
  latency: int
  severity: Optional[str] = None


class EvidenceItem(BaseModel):
  type: str
  id: str
  excerpt: str
  passage_start: Optional[int] = None
  passage_end: Optional[int] = None
  log_line_numbers: Optional[List[int]] = None
  score: Optional[float] = None


class Diagnosis(BaseModel):
  root_cause: str
  confidence: float
  evidence: List[EvidenceItem]


class PatchPlan(BaseModel):
  suggested_fix: str
  patch_snippet: Optional[str] = None
  next_steps: List[str] = Field(default_factory=list)


class AgentResult(BaseModel):
  root_cause: str
  confidence: float
  suggested_fix: str
  patch_snippet: Optional[str] = None
  evidence: List[EvidenceItem]
  next_steps: List[str]
  human_review_required: Optional[bool] = None


class RunIncidentRequest(BaseModel):
  incident: Incident


