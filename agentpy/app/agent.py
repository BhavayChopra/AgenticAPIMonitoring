from typing import Dict, Any, List
from anthropic import Anthropic
import os
import json

from .schemas import Incident, EvidenceItem, AgentResult
from .tools import retriever_tool, graph_query_tool, git_apply_patch_tool, github_pr_tool


class AgenticWorkflow:
  def __init__(self):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
      raise RuntimeError("ANTHROPIC_API_KEY not set")
    self.client = Anthropic(api_key=api_key)
    self.model = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-sonnet-20240620")

  def _call_claude(self, system: str, user: str) -> Dict[str, Any]:
    resp = self.client.messages.create(
      model=self.model,
      max_tokens=1000,
      temperature=0.0,
      system=system,
      messages=[{"role":"user", "content": user}],
    )
    text = ""
    for block in resp.content:
      if block.type == "text":
        text += block.text
    return json.loads(text)

  def retrieve(self, incident: Incident) -> List[Dict[str, Any]]:
    summary = f"{incident.method or ''} {incident.endpoint} status={incident.status_code} latency={incident.latency} logs={incident.logs[:800]}"
    passages = retriever_tool(summary)
    return passages

  def diagnose(self, incident: Incident, passages: List[Dict[str, Any]]) -> Dict[str, Any]:
    system = "You are API Sentinel Agent. Diagnose incidents using provided evidence. Return JSON."
    user = json.dumps({
      "incident": incident.model_dump(),
      "evidence": passages
    })
    return self._call_claude(system, user)

  def plan_fix(self, diagnosis: Dict[str, Any]) -> Dict[str, Any]:
    system = "Produce a patch plan with suggested_fix, optional patch_snippet, and next_steps as JSON."
    user = json.dumps(diagnosis)
    return self._call_claude(system, user)

  def run(self, incident: Incident) -> AgentResult:
    passages = self.retrieve(incident)
    diag = self.diagnose(incident, passages)
    plan = self.plan_fix(diag)

    evidence = [
      EvidenceItem(type="doc", id=p.get("docId","doc"), excerpt=p.get("text","")) for p in passages
    ]

    confidence = float(diag.get("confidence", plan.get("confidence", 0.6)))
    result = AgentResult(
      root_cause=diag.get("root_cause", ""),
      confidence=confidence,
      suggested_fix=plan.get("suggested_fix", diag.get("suggested_fix", "")),
      patch_snippet=plan.get("patch_snippet"),
      evidence=evidence,
      next_steps=plan.get("next_steps", []),
      human_review_required=confidence < float(os.environ.get("CONFIDENCE_THRESHOLD", 0.6))
    )
    return result


