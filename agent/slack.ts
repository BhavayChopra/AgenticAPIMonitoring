import fetch from "node-fetch";

export async function sendSlackAlert(payload: any): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  const text = `API Sentinel Alert\nFix: ${payload.fixId}\nIncident: ${payload.incident.api} ${payload.incident.method ?? ""} ${payload.incident.endpoint}\nStatus: ${payload.incident.status_code}, Latency: ${payload.incident.latency}ms\nRoot cause: ${payload.result.root_cause}\nConfidence: ${payload.result.confidence}`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {}
}


