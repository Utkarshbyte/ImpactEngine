import os
import json
import requests
import networkx as nx
from collections import deque
from dotenv import load_dotenv

load_dotenv()

PRESET_GRAPHS = {
    "ecommerce": {
        "nodes": [
            {"id": "Web Frontend", "type": "frontend", "base_latency_ms": 20, "sla_ms": 800},
            {"id": "Mobile App", "type": "frontend", "base_latency_ms": 25, "sla_ms": 900},
            {"id": "API Gateway", "type": "gateway", "base_latency_ms": 15, "sla_ms": 700},
            {"id": "Auth Service", "type": "service", "base_latency_ms": 30, "sla_ms": 300},
            {"id": "Checkout Service", "type": "service", "base_latency_ms": 50, "sla_ms": 600},
            {"id": "Order Service", "type": "service", "base_latency_ms": 45, "sla_ms": 650},
            {"id": "Payment API", "type": "service", "base_latency_ms": 120, "sla_ms": 1500},
            {"id": "Inventory Service", "type": "service", "base_latency_ms": 35, "sla_ms": 400},
            {"id": "Primary Postgres DB", "type": "database", "base_latency_ms": 40, "sla_ms": 350},
            {"id": "Redis Session Cache", "type": "cache", "base_latency_ms": 5, "sla_ms": 100},
            {"id": "Revenue Pipeline", "type": "pipeline", "base_latency_ms": 100, "sla_ms": 5000},
            {"id": "Analytics Engine", "type": "service", "base_latency_ms": 150, "sla_ms": 10000}
        ],
        "edges": [
            {"source": "Web Frontend", "target": "API Gateway", "dependency_type": "hard"},
            {"source": "Mobile App", "target": "API Gateway", "dependency_type": "hard"},
            {"source": "API Gateway", "target": "Auth Service", "dependency_type": "hard"},
            {"source": "API Gateway", "target": "Checkout Service", "dependency_type": "hard"},
            {"source": "API Gateway", "target": "Order Service", "dependency_type": "hard"},
            {"source": "Auth Service", "target": "Redis Session Cache", "dependency_type": "soft"},
            {"source": "Checkout Service", "target": "Payment API", "dependency_type": "hard"},
            {"source": "Checkout Service", "target": "Inventory Service", "dependency_type": "hard"},
            {"source": "Order Service", "target": "Payment API", "dependency_type": "hard"},
            {"source": "Order Service", "target": "Primary Postgres DB", "dependency_type": "hard"},
            {"source": "Inventory Service", "target": "Primary Postgres DB", "dependency_type": "hard"},
            {"source": "Revenue Pipeline", "target": "Payment API", "dependency_type": "soft"},
            {"source": "Analytics Engine", "target": "Revenue Pipeline", "dependency_type": "soft"}
        ]
    }
}

def get_preset_graph(name: str = "ecommerce") -> dict:
    return PRESET_GRAPHS.get(name, PRESET_GRAPHS["ecommerce"])

def fetch_codebase(github_url: str) -> str:
    tinyfish_api_key = os.getenv("TINYFISH_API_KEY", "mock_key")
    endpoint = "https://api.tinyfish.io/v1/scrape"
    headers = {"Authorization": f"Bearer {tinyfish_api_key}"}
    payload = {"url": github_url, "extract_code": True}

    if tinyfish_api_key == "mock_key" or not tinyfish_api_key:
        return "mock codebase content"

    try:
        response = requests.post(endpoint, json=payload, headers=headers, timeout=15)
        response.raise_for_status()
        return response.json().get("content", "")
    except Exception as e:
        print(f"TinyFish API Error: {e}")
        return "mock codebase content"

def extract_graph(code_text: str) -> dict:
    prune_key = os.getenv("PRUNE_API_KEY", "mock_key")

    if prune_key == "mock_key" or not prune_key or code_text == "mock codebase content":
        return get_preset_graph("ecommerce")

    url = "https://api.withprune.com/v1/proxy/gemini/generateContent"
    headers = {
        "X-Prune-Key": prune_key,
        "Content-Type": "application/json"
    }

    system_prompt = """
    You are ImpactEngine's infrastructure parsing agent.
    Analyze the provided codebase. Extract all services, APIs, databases, caches, and frontends as nodes, and dependencies as directed edges (caller -> callee).
    Tag each edge's dependency_type as "hard" (synchronous/blocking) or "soft" (async/fallback/cached).
    Output ONLY valid JSON:
    {
      "nodes": [ {"id": "service_name", "type": "service", "base_latency_ms": 30, "sla_ms": 500} ],
      "edges": [ {"source": "caller", "target": "callee", "dependency_type": "hard"} ]
    }
    """

    payload = {
        "model": "gemini-3.5-flash-lite",
        "messages": [
            {"role": "user", "content": system_prompt + f"\n\nCodebase:\n{code_text[:10000]}"}
        ]
    }

    response = requests.post(url, headers=headers, json=payload, timeout=20)
    if response.status_code != 200:
        raise Exception(f"Prune API Error: {response.text}")

    try:
        raw_json = response.json()["choices"][0]["message"]["content"]
    except KeyError:
        raw_json = response.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")

    raw_json = raw_json.replace("```json\n", "").replace("```", "").strip()
    return json.loads(raw_json)

def calculate_blast_radius(graph_data: dict, failed_node: str, failure_type: str = "down") -> dict:
    G = nx.DiGraph()
    for node in graph_data.get("nodes", []):
        G.add_node(
            node["id"],
            type=node.get("type", "service"),
            base_latency_ms=node.get("base_latency_ms", 30),
            sla_ms=node.get("sla_ms", 500)
        )
    for edge in graph_data.get("edges", []):
        G.add_edge(
            edge["source"],
            edge["target"],
            dependency_type=edge.get("dependency_type", "hard")
        )

    if failed_node not in G:
        raise ValueError(f"Failed node '{failed_node}' not found in graph.")

    # Reverse graph so failure flows from Callee (target) -> Caller (source)
    rev_G = G.reverse(copy=True)

    root_base_lat = G.nodes[failed_node]["base_latency_ms"]
    initial_added_latency = root_base_lat * 9 if failure_type == "degraded" else 0

    impacted = {}  # node_id -> dict with state, latency, hop, reason
    affected_edges = []
    queue = deque([(failed_node, failure_type, initial_added_latency, 0)])

    while queue:
        curr, curr_state, added_lat, hop = queue.popleft()

        for caller in rev_G.neighbors(curr):
            edge_data = rev_G.edges[curr, caller]
            dep_type = edge_data.get("dependency_type", "hard")
            caller_base = G.nodes[caller]["base_latency_ms"]
            caller_sla = G.nodes[caller]["sla_ms"]

            if curr_state == "down":
                if dep_type == "hard":
                    new_state = "broken"
                    new_added_lat = 0
                    reason = f"Hard dependency '{curr}' is offline"
                else:
                    new_state = "warning"
                    new_added_lat = 0
                    reason = f"Soft/async dependency '{curr}' offline (degraded fallback)"
            else:
                # Latency spike propagation (e.g., 10x DB latency)
                new_added_lat = added_lat
                total_lat = caller_base + new_added_lat
                if dep_type == "hard" and total_lat > caller_sla:
                    new_state = "broken"
                    reason = f"Timeout: {total_lat}ms exceeded {caller_sla}ms SLA due to '{curr}'"
                elif dep_type == "hard":
                    new_state = "warning"
                    reason = f"Latency spike ({total_lat}ms / {caller_sla}ms SLA) from '{curr}'"
                else:
                    new_state = "warning"
                    new_added_lat = int(added_lat * 0.25)
                    reason = f"Async lag from '{curr}' latency spike"

            # Record edge in blast path (caller -> curr in original graph)
            affected_edges.append({
                "source": caller,
                "target": curr,
                "severity": new_state
            })

            # Upgrade severity if node was already reached via a weaker path
            existing = impacted.get(caller)
            if not existing or (existing["state"] == "warning" and new_state == "broken"):
                impacted[caller] = {
                    "id": caller,
                    "state": new_state,
                    "type": G.nodes[caller]["type"],
                    "hop": hop + 1,
                    "simulated_latency_ms": None if new_state == "broken" else caller_base + new_added_lat,
                    "reason": reason
                }
                queue.append((caller, new_state, new_added_lat, hop + 1))

    cascade = sorted(impacted.values(), key=lambda x: (x["hop"], 0 if x["state"] == "broken" else 1))
    total_other_nodes = max(len(G.nodes) - 1, 1)
    blast_pct = round((len(cascade) / total_other_nodes) * 100)
    broken_count = sum(1 for c in cascade if c["state"] == "broken")

    if broken_count >= 4 or blast_pct >= 60:
        criticality = "CRITICAL"
    elif broken_count >= 2 or blast_pct >= 35:
        criticality = "HIGH"
    elif len(cascade) >= 1:
        criticality = "MEDIUM"
    else:
        criticality = "LOW"

    return {
        "root_cause": failed_node,
        "failure_type": failure_type,
        "blast_radius_count": len(cascade),
        "blast_radius_pct": blast_pct,
        "broken_count": broken_count,
        "warning_count": len(cascade) - broken_count,
        "criticality": criticality,
        "cascade": cascade,
        "affected_edges": affected_edges
    }
