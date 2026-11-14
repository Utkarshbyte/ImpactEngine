import os
import json
import requests
import networkx as nx
from dotenv import load_dotenv

load_dotenv()

def fetch_codebase(github_url: str) -> str:
    tinyfish_api_key = os.getenv("TINYFISH_API_KEY", "mock_key")
    endpoint = "https://api.tinyfish.io/v1/scrape" 
    headers = {"Authorization": f"Bearer {tinyfish_api_key}"}
    payload = {"url": github_url, "extract_code": True}
    
    if tinyfish_api_key == "mock_key" or not tinyfish_api_key:
        return "mock codebase content: from payment import gateway\nimport db\n"
    
    try:
        response = requests.post(endpoint, json=payload, headers=headers)
        response.raise_for_status()
        return response.json().get("content", "")
    except Exception as e:
        print(f"TinyFish API Error: {e}")
        return "mock codebase content"

def extract_graph(code_text: str) -> dict:
    prune_key = os.getenv("PRUNE_API_KEY", "mock_key")
    
    if prune_key == "mock_key" or not prune_key:
        return {
            "nodes": [
                {"id": "API Gateway", "type": "gateway"},
                {"id": "Payment Service", "type": "service"},
                {"id": "Order Service", "type": "service"},
                {"id": "User Database", "type": "database"},
                {"id": "Analytics Engine", "type": "service"}
            ],
            "edges": [
                {"source": "API Gateway", "target": "Payment Service"},
                {"source": "API Gateway", "target": "Order Service"},
                {"source": "Payment Service", "target": "User Database"},
                {"source": "Order Service", "target": "User Database"},
                {"source": "User Database", "target": "Analytics Engine"}
            ]
        }

    url = "https://api.withprune.com/v1/proxy/gemini/generateContent"
    headers = {
        "X-Prune-Key": prune_key,
        "Content-Type": "application/json"
    }
    
    system_prompt = """
    You are ImpactEngine's infrastructure parsing agent. 
    Analyze the provided codebase. Extract all internal services, APIs, databases, and frontends as nodes, and dependencies as directed edges.
    Output ONLY valid JSON:
    {
      "nodes": [ {"id": "service_name", "type": "service"} ],
      "edges": [ {"source": "caller", "target": "callee"} ]
    }
    """
    
    payload = {
        "model": "gemini-3.5-flash-lite", 
        "messages": [
            {"role": "user", "content": system_prompt + f"\n\nCodebase:\n{code_text[:10000]}"}
        ]
    }
    
    response = requests.post(url, headers=headers, json=payload)
    
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
        G.add_node(node["id"], type=node.get("type", "service"), state="healthy")
    for edge in graph_data.get("edges", []):
        G.add_edge(edge["source"], edge["target"])
        
    if failed_node not in G:
        raise ValueError("Failed node not found in graph.")
        
    impacted_nodes = list(nx.descendants(G, failed_node))
    cascade = []
    for node in impacted_nodes:
        state = "broken" if failure_type == "down" else "warning"
        cascade.append({
            "id": node,
            "state": state,
            "type": G.nodes[node].get("type")
        })
        
    return {
        "root_cause": failed_node,
        "failure_type": failure_type,
        "blast_radius_count": len(impacted_nodes),
        "cascade": cascade
    }
