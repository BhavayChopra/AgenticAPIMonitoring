import express from "express";
import path from "path";
import fs from "fs";
import { getGraphClient } from "../agent/graph-client";

const app = express();
const port = process.env.DASHBOARD_PORT || 8787;

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/runs", async (_req, res) => {
  try {
    // Minimal: dump recent runs; since our GraphClient doesn't have a list method,
    // we show placeholder. In real implementation, add a query method.
    res.json({ message: "Add query for recent AgentRun nodes in graph-client." });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.get("/", (_req, res) => {
  res.send(`<!doctype html><html><head><title>API Sentinel Dashboard</title></head><body>
    <h1>API Sentinel Dashboard</h1>
    <ul>
      <li><a href="/runs">Recent Agent Runs</a></li>
      <li><a href="/health">Health</a></li>
    </ul>
    <p>Extend this dashboard to query and visualize incidents, fixes, and PRs.</p>
  </body></html>`);
});

app.listen(port, () => console.log(`Dashboard listening on http://localhost:${port}`));


