import os
import json
import requests
from fastapi import APIRouter, HTTPException
from app.core import run_simulation
from app.db.database import get_graph, get_recent_simulations, save_simulation_run
from app.models import ExplainResponse, SimulateRequest, SimulationResult

router = APIRouter(tags=["Simulation & Impact"])


@router.post("/simulate", response_model=SimulationResult)
def execute_simulation(request: SimulateRequest):
    graph = get_graph(request.graph_id)
    if not graph:
        raise HTTPException(status_code=404, detail=f"Graph '{request.graph_id}' not found.")

    try:
        result = run_simulation(graph, request)
        save_simulation_run(request.graph_id, result)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/impact")
def get_impact_history(limit: int = 10):
    return {"recent_runs": get_recent_simulations(limit)}


@router.post("/explain", response_model=ExplainResponse)
def explain_simulation(result: SimulationResult):
    prune_key = os.getenv("PRUNE_API_KEY", "")
    down_names = [n.name for n in result.affected_nodes if n.state.value == "DOWN"]
    degraded_names = [n.name for n in result.affected_nodes if n.state.value == "DEGRADED"]

    # Deterministic fallback if no API key or offline during demo
    fallback_explanation = (
        f"Injecting {result.scenario.failure.value} on {result.scenario.node_name} creates a "
        f"{result.severity} incident affecting {result.blast_radius.affected} of {result.blast_radius.total} "
        f"services ({result.blast_radius.percentage}% blast radius). "
        f"Hard outages hit {', '.join(down_names) if down_names else 'no downstream services'}, "
        f"while {', '.join(degraded_names) if degraded_names else 'no services'} degraded."
    )
    fallback_recs = [
        f"Add a circuit breaker or cached fallback downstream of {result.scenario.node_name} to isolate HARD dependencies.",
        "Configure strict timeout budgets and retry jitter to prevent cascading SLA breaches.",
    ]

    if not prune_key or prune_key == "mock_key":
        return ExplainResponse(explanation=fallback_explanation, recommendations=fallback_recs)

    try:
        url = "https://api.withprune.com/v1/proxy/gemini/generateContent"
        headers = {"X-Prune-Key": prune_key, "Content-Type": "application/json"}
        prompt = (
            "You are an SRE incident commander. Given this blast-radius JSON, return ONLY valid JSON with keys "
            "'explanation' (2 crisp sentences explaining technical + business impact) and "
            "'recommendations' (list of 2 concrete architectural fixes).\n\n"
            f"Simulation JSON:\n{result.model_dump_json()}"
        )
        payload = {
            "model": "gemini-3.5-flash-lite",
            "messages": [{"role": "user", "content": prompt}],
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"]
        raw = raw.replace("```json\n", "").replace("```", "").strip()
        parsed = json.loads(raw)
        return ExplainResponse(
            explanation=parsed.get("explanation", fallback_explanation),
            recommendations=parsed.get("recommendations", fallback_recs),
        )
    except Exception:
        return ExplainResponse(explanation=fallback_explanation, recommendations=fallback_recs)