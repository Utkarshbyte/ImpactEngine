from __future__ import annotations

import html
import json
from datetime import datetime, timezone

import networkx as nx
import requests
import streamlit as st

API_BASE = "http://127.0.0.1:8000"
PAGES = ["Command Center", "Architecture Explorer", "Failure Simulation", "Impact Analysis"]

st.set_page_config(
    page_title="ImpactEngine | Infrastructure Intelligence",
    page_icon="◈",
    layout="wide",
    initial_sidebar_state="expanded",
)

for k, v in {
    "graph_data": None,
    "simulation": None,
    "selected_node": None,
    "active_page": "Command Center",
    "last_source": None,
}.items():
    if k not in st.session_state:
        st.session_state[k] = v


def safe(text):
    return html.escape(str(text), quote=True)


def api_request(method, endpoint, payload=None, params=None):
    try:
        res = requests.request(method, API_BASE + endpoint, json=payload, params=params, timeout=30)
        res.raise_for_status()
        return res.json()
    except Exception as exc:
        st.error(f"Backend error ({API_BASE}{endpoint}): {exc}")
        return None


def load_demo():
    data = api_request("GET", "/graph", params={"graph_id": "ecommerce-core"})
    if data and isinstance(data.get("nodes"), list):
        st.session_state.graph_data = data
        st.session_state.simulation = None
        st.session_state.last_source = data.get("name", "E-Commerce Core")
        st.session_state.selected_node = str(data["nodes"][0]["id"]) if data["nodes"] else None
        st.toast("E-Commerce architecture loaded", icon="✅")


def run_sim(target, mode, mitigations):
    raw = api_request(
        "POST",
        "/simulate",
        {
            "graph_id": st.session_state.graph_data.get("id", "ecommerce-core"),
            "node": target,
            "failure": "DOWN" if mode == "down" else "LATENCY",
            "mitigated_nodes": mitigations,
        },
    )
    if not raw:
        return
    st.session_state.simulation = {
        "root_cause": raw["scenario"]["node"],
        "failure_type": mode,
        "blast_radius_count": raw["blast_radius"]["affected"],
        "broken_count": raw["blast_radius"]["down_count"],
        "warning_count": raw["blast_radius"]["degraded_count"],
        "criticality": f"{raw['severity']} ({raw['criticality_score']}/10)",
        "business_impact": raw.get("business_impact", []),
        "cascade": [
            {
                "id": n["id"],
                "state": "broken" if n["state"] == "DOWN" else "warning",
                "hop": n["hop"],
                "reason": n["reason"],
            }
            for n in raw.get("affected_nodes", [])
        ],
    }
    st.toast("Simulation completed", icon="✅")


with st.sidebar:
    st.markdown("### ◈ IMPACT**ENGINE**")
    page = st.radio("Workspace", PAGES, key="active_page")
    st.button("Load E-Commerce Demo", type="primary", on_click=load_demo, use_container_width=True)
    if st.button("Check API Connection", use_container_width=True):
        if api_request("GET", "/"):
            st.success("FastAPI connected on port 8000")

graph = st.session_state.graph_data
sim = st.session_state.simulation

st.title(page)

if not graph:
    st.info("Click **Load E-Commerce Demo** in the sidebar to connect to `http://127.0.0.1:8000/graph`.")
else:
    nodes = graph.get("nodes", [])
    ids = [str(n["id"]) for n in nodes]
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Services", len(nodes))
    c2.metric("Dependencies", len(graph.get("edges", [])))
    c3.metric("Blast Radius", sim["blast_radius_count"] if sim else "—")
    c4.metric("Criticality", sim["criticality"] if sim else "Standby")

    if page in ("Command Center", "Architecture Explorer"):
        st.subheader("Service Dependencies")
        st.dataframe(
            [
                {
                    "ID": n["id"],
                    "Name": n.get("name", n["id"]),
                    "Type": n.get("type", "service"),
                    "Criticality": f"{n.get('criticality', 3)}/5",
                    "SLA (ms)": n.get("sla_ms", 500),
                    "Business Functions": ", ".join(n.get("business_functions", [])),
                }
                for n in nodes
            ],
            use_container_width=True,
            hide_index=True,
        )

    elif page == "Failure Simulation":
        target = st.selectbox("Target Service", ids, index=ids.index(st.session_state.selected_node) if st.session_state.selected_node in ids else 0)
        st.session_state.selected_node = target
        mode = "down" if st.radio("Failure Mode", ["Hard Crash (DOWN)", "10x Latency Spike (LATENCY)"]) .startswith("Hard") else "degraded"
        mitigations = st.multiselect("Protected Services (Circuit Breakers)", [x for x in ids if x != target])
        col_a, col_b = st.columns(2)
        if col_a.button("Run Simulation", type="primary", use_container_width=True):
            run_sim(target, mode, mitigations)
            st.rerun()
        if col_b.button("Reset", use_container_width=True):
            st.session_state.simulation = None
            st.rerun()

        if sim:
            st.subheader(f"Cascade Results · {sim['criticality']}")
            if sim.get("business_impact"):
                st.warning("**Disrupted Business Capabilities:** " + ", ".join(sim["business_impact"]))
            st.dataframe(sim["cascade"], use_container_width=True, hide_index=True)

    elif page == "Impact Analysis":
        if not sim:
            st.info("Run a simulation in **Failure Simulation** first.")
        else:
            st.subheader(f"Root Cause: {sim['root_cause']} · {sim['criticality']}")
            if sim.get("business_impact"):
                st.error("**Business Impact:** " + ", ".join(sim["business_impact"]))
            st.dataframe(sim["cascade"], use_container_width=True, hide_index=True)
            st.download_button(
                "Download Impact Report (JSON)",
                json.dumps({"exported_at": datetime.now(timezone.utc).isoformat(), "simulation": sim}, indent=2),
                file_name="impactengine_report.json",
                mime="application/json",
            )
