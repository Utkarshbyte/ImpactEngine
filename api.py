from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from core import fetch_codebase, extract_graph, calculate_blast_radius
from typing import Dict, Any

app = FastAPI(title="ImpactEngine API")

class IngestRequest(BaseModel):
    github_url: str

class SimulateRequest(BaseModel):
    graph_data: Dict[str, Any]
    failed_node: str
    failure_type: str = "down"

@app.post("/api/ingest")
def ingest_repo(req: IngestRequest):
    try:
        code_text = fetch_codebase(req.github_url)
        graph_data = extract_graph(code_text)
        return {"status": "success", "graph_data": graph_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/simulate")
def simulate_failure(req: SimulateRequest):
    try:
        result = calculate_blast_radius(req.graph_data, req.failed_node, req.failure_type)
        return {"status": "success", "simulation": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
