/*
  API Sentinel — CLI Entrypoint
  Usage:
    node dist/agent/index.js incident.json
  or via ts-node:
    ts-node agent/index.ts incident.json
*/

import "dotenv/config";
import fs from "fs";
import path from "path";
import { AgentWorkflow } from "./workflow";
import { Incident } from "./types";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Provide a path to an incident JSON file.");
    process.exit(1);
  }
  const p = path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg);
  const raw = fs.readFileSync(p, "utf-8");
  const incident: Incident = JSON.parse(raw);

  const workflow = new AgentWorkflow();
  try {
    const result = await workflow.onIncident(incident, { agentId: "api-sentinel-agent" });
    const output = {
      fix_id: result.fixId,
      llm: result.llm,
    };
    console.log(JSON.stringify(output, null, 2));
  } catch (err: any) {
    console.error("Agent run failed:", err?.message || err);
    process.exit(2);
  }
}

main();


