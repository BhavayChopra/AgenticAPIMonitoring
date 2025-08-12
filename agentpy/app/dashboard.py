from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
def home():
  # Placeholder for a more sophisticated dashboard; wire to Neo4j query endpoints
  return """
  <!doctype html>
  <html>
    <head><title>API Sentinel Dashboard</title></head>
    <body>
      <h1>API Sentinel Dashboard</h1>
      <ul>
        <li><a href='/health'>Health</a></li>
      </ul>
      <p>Replace with rich dashboards (runs, incidents, fixes) backed by Neo4j queries.</p>
    </body>
  </html>
  """


