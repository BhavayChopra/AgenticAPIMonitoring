## Agentic API Monitoring (API Sentinel Agent Layer)

Local-first incident diagnosis and remediation suggestions for APIs using a temporally-aware knowledge graph and a Python agent powered by Claude 3.5 Sonnet.

### Features
- Temporal knowledge graph (Neo4j or in-memory fallback)
- Hybrid retrieval (graph filter + vector/BM25 passage ranking)
- Tool-calling agent (LangGraph) with structured outputs (JSON) using Claude 3.5 Sonnet
- Audit trail: persists AgentRun, Fix, and tool call events
- Configurable with Slack for Alerts

### Quickstart
1. Install prerequisites:
   - Neo4j (optional for dev; in-memory fallback available)
   - Node.js 18+
   - Python 3.10+ (primary agent)
2. Setup
   - Copy `agent/config.example.env` to `.env` and adjust as needed
   - Install deps: `npm install`
3. Run
   - Build TS worker: `npm run build`
   - Start Python agent:
     - `cd agentpy && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
     - Set `ANTHROPIC_API_KEY` and (optional) `ANTHROPIC_MODEL=claude-3-5-sonnet-20240620`
     - `uvicorn app.main:app --host 0.0.0.0 --port 8088`
   - In `.env`, set `AGENTPY_URL=http://127.0.0.1:8088`
   - Execute with sample incident: `npm start`
   - Start dashboard (served from Python service): see `agentpy` section

### Agent (Python, primary)
- The Python service implements the LangGraph tool-calling agent and exposes `/run_incident`. The Node worker persists incidents/fixes and delegates reasoning to Python.

### Repo Structure
- `agent/` TypeScript agent worker
- `docs/` Schema and prompt examples
- `scripts/` Neo4j init scripts
- `examples/` Sample incidents / payloads

### Environment
See `agent/config.example.env` for configuration. Key vars:
- `NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD`
- `ANTHROPIC_API_KEY, ANTHROPIC_MODEL`
- `MAX_EVIDENCE, SUGGEST_MODE, CONFIDENCE_THRESHOLD`
- `AGENTPY_URL` to enable the advanced Python workflow
- `SLACK_WEBHOOK_URL` to enable Slack alerts

### Data Model
See `docs/schema.md` for nodes, relationships, temporal properties, and example queries.

### Few-shot Prompting
See `docs/prompt_examples.md`.

### License
MIT


