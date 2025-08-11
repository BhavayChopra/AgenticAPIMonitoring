# agentpy — Advanced Agent Workflow (LangGraph + FastAPI)

This service implements a sophisticated agentic workflow using LangChain/LangGraph and Pydantic. The TypeScript worker optionally delegates incident handling to this service via `AGENTPY_URL`.

## Endpoints
- POST `/run_incident` { incident }
  - Returns: `{ result, traces }` where `result` matches the TS `LLMOutput` schema.

## Dev
```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8088 --reload
```


