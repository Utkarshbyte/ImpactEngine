from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from core import fetch_codebase, extract_graph, calculate_blast_radius, get_preset_graph
from typing import Dict, Any, List, Optional

app = FastAPI(title="ImpactEngine API")

class IngestRequest(BaseModel):
    github_url: str

class SimulateRequest(BaseModel):
    graph_data: Dict[str, Any]
    failed_node: str
    failure_type: str = "down"
    mitigated_nodes: Optional[List[str]] = []

@app.get("/")
def health_check():
    return {"status": "online", "service": "ImpactEngine API"}

@app.get("/api/preset/{name}")
def load_preset(name: str):
    return {"status": "success", "graph_data": get_preset_graph(name)}

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
        # Apply circuit-breaker mitigation if requested by converting incoming hard edges to soft
        graph_copy = {
            "nodes": [dict(n) for n in req.graph_data.get("nodes", [])],
            "edges": [dict(e) for e in req.graph_data.get("edges", [])]
        }
        if req.mitigated_nodes:
            for edge in graph_copy["edges"]:
                if edge["source"] in req.mitigated_nodes or edge["target"] in req.mitigated_nodes:
                    edge["dependency_type"] = "soft"

        result = calculate_blast_radius(graph_copy, req.failed_node, req.failure_type)
        return {"status": "success", "simulation": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
