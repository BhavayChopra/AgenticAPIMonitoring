## Agentic API Monitoring (API Sentinel Agent Layer)

Local-first incident diagnosis and remediation suggestions for APIs using a temporally-aware knowledge graph and Ollama (Llama 3.2).

### Features
- Temporal knowledge graph (Neo4j or in-memory fallback)
- Hybrid retrieval (graph filter + vector/BM25 passage ranking)
- Deterministic LLM outputs (JSON) with confidence and evidence
- Audit trail: persists AgentRun and Fix nodes

### Quickstart
1. Install prerequisites:
   - Neo4j (optional for dev; in-memory fallback available)
   - Ollama with model `llama3.2`
   - Node.js 18+
   - (Optional) Python 3.10+ for advanced agent: see `agentpy/`
2. Setup
   - Copy `agent/config.example.env` to `.env` and adjust as needed
   - Install deps: `npm install`
3. Run
   - Build: `npm run build`
   - Execute with sample incident: `npm start`
   - Or dev (TS): `npm run agent -- examples/incident.json`
   - Start dashboard: `npm run dashboard`

### Advanced Agent (Python, optional)
- Start service:
  - `cd agentpy && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
  - `uvicorn app.main:app --host 0.0.0.0 --port 8088 --reload`
- Set `AGENTPY_URL=http://127.0.0.1:8088` in `.env` to route incidents through the advanced workflow

### Repo Structure
- `agent/` TypeScript agent worker
- `docs/` Schema and prompt examples
- `scripts/` Neo4j init scripts
- `examples/` Sample incidents / payloads

### Environment
See `agent/config.example.env` for configuration. Key vars:
- `NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD`
- `OLLAMA_HOST, OLLAMA_PORT, OLLAMA_MODEL`
- `MAX_EVIDENCE, SUGGEST_MODE, CONFIDENCE_THRESHOLD`
- `AGENTPY_URL` to enable the advanced Python workflow
- `SLACK_WEBHOOK_URL` to enable Slack alerts

### Data Model
See `docs/schema.md` for nodes, relationships, temporal properties, and example queries.

### Few-shot Prompting
See `docs/prompt_examples.md`.

### License
MIT


