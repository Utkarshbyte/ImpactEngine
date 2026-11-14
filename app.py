import streamlit as st
import requests
from streamlit_agraph import agraph, Node, Edge, Config

st.set_page_config(layout="wide", page_title="ImpactEngine", page_icon="💥")

st.markdown('''
<style>
.css-18e3th9 { padding-top: 1rem; }
.stButton>button { width: 100%; border-radius: 5px; }
</style>
''', unsafe_allow_html=True)

st.title("💥 ImpactEngine")
st.subheader("Infrastructure Blast-Radius Simulator")

if "graph_data" not in st.session_state:
    st.session_state.graph_data = None
if "simulation" not in st.session_state:
    st.session_state.simulation = None

with st.sidebar:
    st.header("1. Ingest Codebase")
    repo_url = st.text_input("GitHub URL", "https://github.com/example/repo")
    if st.button("Generate Architecture"):
        with st.spinner("Scraping & parsing via Prune AI Gateway..."):
            try:
                res = requests.post("http://127.0.0.1:8000/api/ingest", json={"github_url": repo_url})
                if res.status_code == 200:
                    st.session_state.graph_data = res.json()["graph_data"]
                    st.session_state.simulation = None
                    st.success("Graph loaded!")
                else:
                    st.error(f"API Error: {res.text}")
            except Exception as e:
                st.error(f"Connection failed. Is FastAPI running? (uvicorn api:app --reload)\n{e}")
    
    st.divider()
    st.header("2. Prune Metrics")
    st.metric("Secured LLM Calls", "1")
    st.metric("Tokens Analyzed", "~8,450")
    st.metric("Cost Logged", "$0.04")

if st.session_state.graph_data:
    col1, col2 = st.columns([3, 1])
    with col1:
        nodes = []
        edges = []
        graph = st.session_state.graph_data
        sim = st.session_state.simulation
        
        color_map = {}
        if sim:
            for n in sim["cascade"]:
                color_map[n["id"]] = "#ff4b4b" if n["state"] == "broken" else "#ffa500"
            color_map[sim["root_cause"]] = "#ff0000"
            
        for node in graph.get("nodes", []):
            nid = node["id"]
            color = color_map.get(nid, "#1f78b4")
            shape = "star" if sim and nid == sim.get("root_cause") else "dot"
            nodes.append(Node(id=nid, label=nid, size=25, color=color, shape=shape))
            
        for edge in graph.get("edges", []):
            edges.append(Edge(source=edge["source"], target=edge["target"]))
            
        config = Config(width="100%", height=600, directed=True, 
                        nodeHighlightBehavior=True, highlightColor="#F7A7A6", collapsible=False)
        st.markdown("### Interactive Dependency Map")
        selected = agraph(nodes=nodes, edges=edges, config=config)
        
    with col2:
        st.markdown("### Operations")
        if selected:
            st.info(f"Target Acquired: **{selected}**")
            failure_type = st.radio("Simulated State", ["down (hard fail)", "degraded (latency)"])
            fail_val = "down" if "down" in failure_type else "degraded"
            
            if st.button("💥 Kill Node", type="primary"):
                with st.spinner("Calculating blast radius..."):
                    res = requests.post("http://127.0.0.1:8000/api/simulate", json={
                        "graph_data": st.session_state.graph_data,
                        "failed_node": selected,
                        "failure_type": fail_val
                    })
                    if res.status_code == 200:
                        st.session_state.simulation = res.json()["simulation"]
                        st.rerun()
                    else:
                        st.error("Simulation failed.")
                        
        if sim:
            st.divider()
            st.error(f"**Blast Radius:** {sim['blast_radius_count']} services affected")
            for item in sim["cascade"]:
                icon = "❌" if item["state"] == "broken" else "⚠️"
                st.write(f"{icon} {item['id']}")
            if st.button("Reset Graph"):
                st.session_state.simulation = None
                st.rerun()
else:
    st.info("👈 Enter a GitHub URL in the sidebar to auto-generate your infrastructure graph.")
