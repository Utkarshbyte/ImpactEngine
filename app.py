"""ImpactEngine — premium Streamlit frontend.

Replace app.py with this file. Existing api.py and core.py remain unchanged.
Run in host's project folder: python -m streamlit run app.py
Requires: streamlit, requests, networkx (installed with streamlit-agraph), streamlit-agraph.
"""

from __future__ import annotations

import html
import json
from datetime import datetime, timezone
from urllib.parse import urlparse

import networkx as nx
import requests
import streamlit as st
from streamlit_agraph import Config, Edge, Node, agraph

API_BASE = "http://127.0.0.1:8000"
PAGES = ["Command Center", "Architecture Explorer", "Failure Simulation", "Impact Analysis"]

st.set_page_config(
    page_title="ImpactEngine | Infrastructure Intelligence",
    page_icon="◈",
    layout="wide",
    initial_sidebar_state="expanded",
    menu_items={"About": "ImpactEngine · Dependency intelligence & failure simulation"},
)

# Native dark theme is set in the accompanying .streamlit/config.toml.
# CSS complements the native theme with branded panels and layout details.
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap');
:root {color-scheme:dark; --bg:#080e19; --panel:#101a2a; --border:#223249; --text:#eaf2ff; --muted:#8e9fb8; --cyan:#39c9f1;}
html,body,[class*="css"], [data-testid="stApp"] {font-family:'DM Sans', sans-serif;}
.stApp, [data-testid="stAppViewContainer"], [data-testid="stMain"] {background:#080e19 !important;color:var(--text) !important;}
[data-testid="stHeader"] {background:rgba(8,14,25,.8)!important; backdrop-filter:blur(14px);}
[data-testid="stToolbar"] {background:transparent!important;}
.block-container {max-width:1450px; padding:1.8rem 2.8rem 3rem;}
section[data-testid="stSidebar"] {background:#0b1423!important; border-right:1px solid #202e45;}
section[data-testid="stSidebar"] .block-container {padding-top:1.2rem;}
section[data-testid="stSidebar"] [data-testid="stSidebarContent"] {padding:1.35rem 1.1rem;}
h1,h2,h3,h4 {font-family:'Space Grotesk','DM Sans',sans-serif!important;letter-spacing:-.035em!important;color:#f1f6ff!important;}
p, label, span, div {text-rendering:optimizeLegibility;}
[data-testid="stMarkdownContainer"] p {line-height:1.52;}
[data-testid="stCaptionContainer"] {color:#8d9bb3!important;}
hr {border-color:#1d2b3e!important;margin:1rem 0!important;}
[data-testid="stRadio"] div[role="radiogroup"] {gap:.1rem;}
section[data-testid="stSidebar"] [data-testid="stRadio"] label {padding: .56rem .65rem; border-radius:9px; transition:background .18s ease;}
section[data-testid="stSidebar"] [data-testid="stRadio"] label:hover {background:#15253b;}
section[data-testid="stSidebar"] [data-testid="stRadio"] label p {color:#d4e1f4!important;font-size:.91rem;}
[data-testid="stTextInput"] input,[data-testid="stSelectbox"]>div>div,[data-testid="stMultiSelect"]>div>div, [data-testid="stTextArea"] textarea {background:#101d2e!important; color:#eef4ff!important; border-color:#2a3c57!important; border-radius:10px!important;}
[data-testid="stTextInput"] input::placeholder {color:#667f9b!important;}
.stButton>button,.stDownloadButton>button {width:100%; background:#14243a!important; border:1px solid #2c425f!important; color:#e9f4ff!important; border-radius:10px!important;min-height:42px!important;font-weight:650!important;transition:all .15s ease!important;}
.stButton>button:hover,.stDownloadButton>button:hover {background:#1c314d!important;border-color:#42c9e8!important;color:#f4fcff!important;}
.stButton>button[kind="primary"] {background:#0b8cb6!important; color:white!important; border-color:#1faed1!important;box-shadow:0 5px 22px rgba(19,178,221,.14);}
.stButton>button[kind="primary"]:hover {background:#0c9ec6!important;}
[data-testid="stAlert"] {background:#0d2235!important;border:1px solid #204c62!important;border-radius:11px!important;color:#cee9f7!important;}
[data-testid="stExpander"] {background:#101a2a;border:1px solid #25364d;border-radius:12px;overflow:hidden;}
[data-testid="stDataFrame"] {border:1px solid #24374e;border-radius:12px;overflow:hidden;}
.ie-brand {display:flex;align-items:center;gap:10px;padding:.05rem 0 .3rem;}
.ie-symbol {display:grid;place-items:center;flex:0 0 35px;width:35px;height:35px;border-radius:11px;background:linear-gradient(135deg,#0f5476,#0e2a48);border:1px solid #357c9b;color:#77ecff;font-size:22px;box-shadow:0 0 26px rgba(46,207,243,.11);}
.ie-brand-name {font-family:'Space Grotesk',sans-serif;font-size:20px;letter-spacing:-.8px;font-weight:800;color:#f4f9ff;}
.ie-brand-name b {color:#48d5ef;}
.ie-brand-sub {font-size:10px;letter-spacing:1.85px;color:#7692b2;margin-top:-2px;font-weight:700;}
.ie-side-label {color:#6f8fac;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:800;margin:20px 0 8px;}
.ie-sidebar-footer {margin-top:20px;padding:12px 13px;border:1px solid #1c3045;background:#0e1e30;border-radius:12px;font-size:12px;color:#8faac2;line-height:1.8;}
.ie-dot {display:inline-block; width:7px;height:7px;border-radius:50%;background:#32d3ad;box-shadow:0 0 12px #32d3ad99;margin-right:6px;}
.ie-topstrip {display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #1e2b3e;padding:4px 0 20px;margin-bottom:28px;}
.ie-top-left {color:#a0b3cd;font-size:12px;letter-spacing:.05em;}
.ie-top-left b {color:#e5f3ff;font-weight:650;}
.ie-status {border:1px solid #244c49;color:#9ee9d3;background:#102728;border-radius:100px;padding:6px 12px;font-size:11px;font-weight:700;white-space:nowrap;}
.ie-page-kicker {color:#40cee9;font-size:10px;letter-spacing:2.15px;font-weight:800;text-transform:uppercase;margin-bottom:7px;}
.ie-page-title {font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:clamp(29px,3vw,40px);line-height:1.15;letter-spacing:-1.6px;color:#f4f7fd;margin-bottom:5px;}
.ie-page-desc {font-size:13.5px;color:#8da3be;margin-bottom:27px;line-height:1.55;}
.ie-metrics {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin:0 0 26px;}
.ie-metric {position:relative;overflow:hidden;min-height:119px;border:1px solid #23354e;border-radius:14px;background:linear-gradient(155deg,#142239,#0c1727 86%);padding:20px 20px 17px;}
.ie-metric:before {content:'';position:absolute;top:0;left:22px;width:45px;height:1px;background:#39c9f188;}
.ie-metric:nth-child(2):before {background:#9a86f188;}.ie-metric:nth-child(3):before {background:#6aebb988;}.ie-metric:nth-child(4):before {background:#f5af6588;}
.ie-metric-label {font-size:12px;color:#97aac3;margin-bottom:16px;font-weight:600;}
.ie-metric-value {font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;letter-spacing:-1px;color:#eff8ff;line-height:1.05;white-space:nowrap;}
.ie-metric-sub {color:#6885a4;font-size:10.5px;margin-top:7px;}
.ie-section-bar {display:flex;justify-content:space-between;align-items:center;margin:17px 0 11px;gap:10px;}
.ie-section-name {font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:700;letter-spacing:-.35px;color:#e9f4ff;}
.ie-section-meta {color:#63859f;font-size:11px;letter-spacing:.04em;}
.ie-card {border:1px solid #22344b;background:linear-gradient(155deg,#111e30,#0d1828);border-radius:15px;padding:21px 23px;margin-bottom:13px;}
.ie-card-label {font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:800;color:#56b5ce;margin-bottom:12px;}
.ie-card-title {font-family:'Space Grotesk',sans-serif;font-size:19px;letter-spacing:-.5px;font-weight:650;color:#f1f6ff;margin-bottom:8px;}
.ie-card-copy {font-size:12.8px;line-height:1.68;color:#90a6c0;}
.ie-chip {display:inline-flex;align-items:center;gap:6px;border:1px solid #24495d;border-radius:8px;background:#102638;color:#7cdaf0;font-weight:700;letter-spacing:.03em;font-size:10px;padding:5px 9px;}
.ie-chip.warn {border-color:#60432b;background:#2a2018;color:#f5bd78;}.ie-chip.crit {border-color:#6a3346;background:#2a1a29;color:#ff8fa1;}
.ie-divider {height:1px;background:#1f3045;margin:16px 0;}
.ie-list-item {padding:11px 0;display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #1d2d41;font-size:12px;}
.ie-list-item:last-child {border-bottom:none;}
.ie-list-item span {color:#d7e7f8;overflow-wrap:anywhere;}.ie-list-item em {font-style:normal;color:#708ca6;}
.ie-graph-wrap {background:radial-gradient(ellipse at 52% 42%,#112944 0%,#0b182b 52%,#091421 100%);border:1px solid #294059;border-radius:15px;overflow:hidden;position:relative;box-shadow:inset 0 1px 0 rgba(112,213,241,.07);margin:0 0 13px;}
.ie-graph-head {display:flex;justify-content:space-between;align-items:center;padding:16px 18px 0;}
.ie-graph-title {font-size:11px;letter-spacing:1px;font-weight:800;color:#85cfe2;text-transform:uppercase;}
.ie-graph-note {font-size:10px;color:#6e92aa;}
.ie-legend {display:flex;align-items:center;flex-wrap:wrap;gap:16px;font-size:11px;color:#87a0bd;margin:5px 0 14px;}
.ie-legend i {display:inline-block;height:8px;width:8px;border-radius:50%;margin-right:6px;}
.ie-empty {padding:26px;background:linear-gradient(140deg,#0e2233,#101729);border:1px dashed #31506a;border-radius:14px;margin:10px 0 18px;}
.ie-empty b {display:block;font-size:14px;color:#e2f2ff;margin-bottom:7px;}.ie-empty span {color:#91adc9;font-size:12px;line-height:1.6;}
.ie-service {padding:13px 14px;border-radius:11px;border:1px solid #26394f;background:#101e30;margin:10px 0;}
.ie-service-name {font-size:13px;font-weight:700;color:#edf7ff;}.ie-service-meta {color:#819ab6;font-size:11.5px;margin-top:5px;line-height:1.5;}
.ie-subline {font-size:11px;color:#728da8;margin:9px 0 18px;}
@media (max-width:1050px){.ie-metrics{grid-template-columns:repeat(2,minmax(0,1fr));}.block-container{padding:1.2rem 1.5rem 3rem;}}
@media (max-width:640px){.ie-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ie-metric{padding:15px;min-height:104px}.ie-metric-value{font-size:22px}.ie-topstrip{display:block}.ie-status{display:inline-block;margin-top:12px}.block-container{padding:1rem .8rem 3rem;}}
</style>
""", unsafe_allow_html=True)


DEFAULT_STATE = {
    "graph_data": None, "simulation": None, "selected_node": None,
    "active_page": "Command Center", "last_source": None, "last_run": None,
    "api_check": None, "graph_mode": "Studio view",
}
for _key, _value in DEFAULT_STATE.items():
    if _key not in st.session_state:
        st.session_state[_key] = _value


def safe(text):
    return html.escape(str(text), quote=True)


def navigate(target):
    st.session_state.active_page = target


def api_request(method, endpoint, payload=None):
    try:
        response = requests.request(method, API_BASE + endpoint, json=payload, timeout=60)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError:
        st.error("Could not connect to FastAPI on port 8000. Start `python -m uvicorn api:app --reload` on the host.")
    except requests.exceptions.HTTPError as exc:
        st.error(f"Backend error {exc.response.status_code}: {exc.response.text[:500]}")
    except requests.exceptions.RequestException as exc:
        st.error(f"API request failed: {exc}")
    except ValueError:
        st.error("The backend did not return valid JSON.")
    return None


def set_graph(data, source):
    if not isinstance(data, dict) or not isinstance(data.get("nodes"), list) or not isinstance(data.get("edges"), list):
        st.error("The response did not contain a valid graph_data object.")
        return False
    st.session_state.graph_data = data
    st.session_state.simulation = None
    st.session_state.last_source = source
    st.session_state.selected_node = str(data["nodes"][0].get("id")) if data["nodes"] else None
    st.session_state.last_run = None
    return True


def analyze_repository():
    url = st.session_state.get("repo_url", "").strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "github.com" or len(parsed.path.strip("/").split("/")) < 2:
        st.error("Enter a GitHub URL like https://github.com/organization/repository")
        return
    with st.spinner("Analyzing repository structure..."):
        data = api_request("POST", "/api/ingest", {"github_url": url})
        if data and set_graph(data.get("graph_data"), url):
            st.toast("Architecture loaded", icon="✅")


def load_demo():
    with st.spinner("Loading reference architecture..."):
        data = api_request("GET", "/api/preset/ecommerce")
        if data and set_graph(data.get("graph_data"), "E-Commerce Demo"):
            st.toast("E-Commerce demo ready", icon="✅")


def simulate(target, mode, mitigations):
    with st.spinner("Calculating failure propagation..."):
        data = api_request("POST", "/api/simulate", {
            "graph_data": st.session_state.graph_data,
            "failed_node": target,
            "failure_type": mode,
            "mitigated_nodes": mitigations,
        })
    if data is None:
        return
    simulation = data.get("simulation") if isinstance(data, dict) else None
    if not isinstance(simulation, dict):
        st.error("Backend returned no simulation result.")
        return
    st.session_state.simulation = simulation
    st.session_state.last_run = datetime.now(timezone.utc).isoformat()
    st.toast("Simulation completed", icon="✅")


def metric(label, value, note):
    return f'<div class="ie-metric"><div class="ie-metric-label">{safe(label)}</div><div class="ie-metric-value">{safe(value)}</div><div class="ie-metric-sub">{safe(note)}</div></div>'


def metrics(items):
    st.markdown('<div class="ie-metrics">' + ''.join(metric(*item) for item in items) + '</div>', unsafe_allow_html=True)


def page_head(eyebrow, title, subtitle):
    st.markdown(f'<div class="ie-page-kicker">{safe(eyebrow)}</div><div class="ie-page-title">{safe(title)}</div><div class="ie-page-desc">{safe(subtitle)}</div>', unsafe_allow_html=True)


def section(title, meta=""):
    st.markdown(f'<div class="ie-section-bar"><span class="ie-section-name">{safe(title)}</span><span class="ie-section-meta">{safe(meta)}</span></div>', unsafe_allow_html=True)


def card(kicker, heading, copy):
    st.markdown(f'<div class="ie-card"><div class="ie-card-label">{safe(kicker)}</div><div class="ie-card-title">{safe(heading)}</div><div class="ie-card-copy">{safe(copy)}</div></div>', unsafe_allow_html=True)


def current_stats(graph, sim):
    nodes = len(graph.get("nodes", [])) if graph else 0
    edges = len(graph.get("edges", [])) if graph else 0
    cascade = [x for x in (sim.get("cascade") or []) if isinstance(x, dict)] if sim else []
    broken = sum(str(x.get("state")).lower() == "broken" for x in cascade)
    warning = sum(str(x.get("state")).lower() in ("warning", "degraded") for x in cascade)
    if sim:
        try:
            affected = int(sim.get("blast_radius_count", len({str(x.get("id")) for x in cascade if x.get("id") is not None})))
        except (TypeError, ValueError):
            affected = len(cascade)
        broken = sim.get("broken_count", broken)
        warning = sim.get("warning_count", warning)
    else:
        affected = 0
    return dict(nodes=nodes, edges=edges, cascade=cascade, broken=broken, warning=warning,
                affected=affected, pct=(100*affected/nodes if nodes else 0))


def node_status_map(sim):
    out = {}
    if not sim:
        return out
    for node in sim.get("cascade", []):
        if isinstance(node, dict) and node.get("id") is not None:
            state = str(node.get("state", "")).lower()
            out[str(node["id"])] = "broken" if state == "broken" else "warning"
    if sim.get("root_cause") is not None:
        out[str(sim["root_cause"])] = "root"
    return out



def studio_graph(graph, sim=None, height=460):
    """n8n-inspired workflow view using the existing graph data."""
    records = [
        n for n in graph.get("nodes", [])
        if isinstance(n, dict) and n.get("id") is not None
    ][:24]

    if not records:
        st.info("No architecture nodes to display.")
        return

    ids = {str(n["id"]) for n in records}
    links = [
        e for e in graph.get("edges", [])
        if isinstance(e, dict)
        and str(e.get("source")) in ids
        and str(e.get("target")) in ids
    ]

    network = nx.DiGraph()
    network.add_nodes_from(ids)
    network.add_edges_from(
        (str(e["source"]), str(e["target"])) for e in links
    )

    # Build left-to-right layers, including graphs with cycles.
    condensed = nx.condensation(network)
    depth = {}
    for component in nx.topological_sort(condensed):
        parents = list(condensed.predecessors(component))
        depth[component] = max(
            (depth[p] + 1 for p in parents), default=0
        )

    layers = {}
    for component, attrs in condensed.nodes(data=True):
        for nid in attrs["members"]:
            layers[nid] = depth[component]

    columns = {}
    order = {str(n["id"]): i for i, n in enumerate(records)}

    for nid in sorted(ids, key=lambda n: (layers[n], order[n])):
        columns.setdefault(layers[nid], []).append(nid)

    card_w, card_h = 164, 58
    W = max(1020, 110 + max(columns) * 210 + card_w)
    H = max(int(height), 100 + max(len(v) for v in columns.values()) * 88)

    xy = {}
    for col, group in columns.items():
        for index, nid in enumerate(group):
            xy[nid] = (
                55 + card_w / 2 + col * 210,
                H * (index + 1) / (len(group) + 1)
            )

    status = node_status_map(sim)
    selected = str(st.session_state.get("selected_node") or "")

    palette = {
        "normal": ("#38d5e8", "#0f2e3b"),
        "warning": ("#f6bd5f", "#392c23"),
        "broken": ("#ff607f", "#381d30"),
        "root": ("#ff607f", "#381d30"),
    }

    svg = [
        f'<svg viewBox="0 0 {W} {H}" '
        f'xmlns="http://www.w3.org/2000/svg" '
        f'role="img" aria-label="Service dependency workflow" '
        f'style="width:100%;height:auto;display:block">',
        '<defs>'
        '<pattern id="workflow-dots" width="20" height="20" '
        'patternUnits="userSpaceOnUse">'
        '<circle cx="1" cy="1" r="1" fill="#3a536a" opacity=".4"/>'
        '</pattern>'
        '<linearGradient id="workflow-card" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#16283c"/>'
        '<stop offset="1" stop-color="#0a1627"/>'
        '</linearGradient>'
        '<filter id="workflow-glow" x="-50%" y="-90%" '
        'width="200%" height="280%">'
        '<feGaussianBlur stdDeviation="7"/>'
        '</filter>'
        '<marker id="workflow-arrow" markerWidth="7" markerHeight="7" '
        'refX="6" refY="3.5" orient="auto">'
        '<path d="M0 0 L7 3.5 L0 7 z" fill="#819bb4"/>'
        '</marker>'
        '</defs>',
        f'<rect width="{W}" height="{H}" fill="url(#workflow-dots)"/>',
    ]

    # Curved workflow connectors
    for link in links:
        source = str(link["source"])
        target = str(link["target"])

        if source == target:
            continue

        ax, ay = xy[source]
        bx, by = xy[target]

        x1 = ax + card_w / 2 + 5
        x2 = bx - card_w / 2 - 5
        spread = max(45, abs(x2 - x1) * 0.45)

        control_x1 = x1 + spread
        control_x2 = x2 - spread if x2 > x1 else x1 + spread

        state = status.get(target, status.get(source, "normal"))
        edge_color = (
            "#ff607f" if state in ("root", "broken")
            else "#e3a954" if state == "warning"
            else "#718ba3"
        )

        dash = (
            ' stroke-dasharray="6 6"'
            if link.get("dependency_type") == "soft" else ""
        )

        svg.append(
            f'<path d="M{x1:.1f},{ay:.1f} '
            f'C{control_x1:.1f},{ay:.1f} '
            f'{control_x2:.1f},{by:.1f} {x2:.1f},{by:.1f}" '
            f'fill="none" stroke="{edge_color}" '
            f'stroke-width="2.2" opacity=".83"'
            f'{dash} marker-end="url(#workflow-arrow)"/>'
        )

    # Rounded service cards
    for node in records:
        nid = str(node["id"])
        x, y = xy[nid]

        left = x - card_w / 2
        top = y - card_h / 2

        state = status.get(nid, "normal")
        accent, icon_bg = palette[state]
        is_selected = nid == selected
        border = (
            "#9feefe"
            if is_selected and state == "normal" else accent
        )

        label = str(node.get("label") or nid)
        lines = [label]

        if len(label) > 16 and " " in label:
            words = label.split()
            cuts = [
                (" ".join(words[:i]), " ".join(words[i:]))
                for i in range(1, len(words))
            ]
            lines = list(min(
                cuts,
                key=lambda p: (
                    max(len(p[0]), len(p[1])),
                    abs(len(p[0]) - len(p[1]))
                )
            ))

        lines = [
            part if len(part) <= 17 else part[:14] + "..."
            for part in lines
        ]

        lower = label.lower()

        if any(s in lower for s in ("db", "postgres", "redis", "cache")):
            kind = "DB"
        elif any(s in lower for s in ("web", "mobile", "frontend")):
            kind = "UI"
        elif any(s in lower for s in ("api", "gateway")):
            kind = "API"
        else:
            kind = "SVC"

        svg.extend([
            f'<g><title>{safe(label)} · {safe(state)}</title>',
            f'<rect x="{left:.1f}" y="{top:.1f}" '
            f'width="{card_w}" height="{card_h}" rx="12" '
            f'fill="{accent}" opacity=".16" '
            f'filter="url(#workflow-glow)"/>',
            f'<rect x="{left:.1f}" y="{top:.1f}" '
            f'width="{card_w}" height="{card_h}" rx="12" '
            f'fill="url(#workflow-card)" stroke="{border}" '
            f'stroke-width="{2.5 if is_selected else 1.6}"/>',
            f'<rect x="{left+10:.1f}" y="{top+12:.1f}" '
            f'width="34" height="34" rx="9" '
            f'fill="{icon_bg}" stroke="{accent}" '
            f'stroke-opacity=".45"/>',
            f'<text x="{left+27:.1f}" y="{top+33:.1f}" '
            f'font-size="10" font-weight="700" '
            f'text-anchor="middle" fill="{accent}" '
            f'font-family="Arial,sans-serif">{kind}</text>',
            f'<text x="{left+53:.1f}" '
            f'y="{top+(26 if len(lines)>1 else 34):.1f}" '
            f'fill="#edf7ff" font-family="Arial,sans-serif" '
            f'font-size="12" font-weight="600">'
            f'{safe(lines[0])}</text>',
            (
                f'<text x="{left+53:.1f}" y="{top+42:.1f}" '
                f'fill="#aebfd2" font-family="Arial,sans-serif" '
                f'font-size="11" font-weight="600">'
                f'{safe(lines[1])}</text>'
            ) if len(lines) > 1 else "",
            f'<circle cx="{left:.1f}" cy="{y:.1f}" r="4.4" '
            f'fill="#132136" stroke="{accent}" stroke-width="2"/>',
            f'<circle cx="{left+card_w:.1f}" cy="{y:.1f}" '
            f'r="4.4" fill="{accent}"/>',
            '</g>',
        ])

    svg.append('</svg>')

    count = len(graph.get("nodes", []))
    note = (
        f' · first {len(records)} of {count} services'
        if count > len(records) else ''
    )

    markup = (
        '<div class="ie-graph-wrap" style="overflow-x:auto">'
        '<div class="ie-graph-head">'
        '<div class="ie-graph-title">Service dependency workflow</div>'
        '<div class="ie-graph-note">'
        'N8N-INSPIRED · MODELED TOPOLOGY'
        + safe(note)
        + '</div></div>'
        + ''.join(svg)
        + '</div>'
    )

    st.markdown(markup, unsafe_allow_html=True)



def interactive_graph(graph, sim=None, height=520):
    """Keep the existing click-to-select graph for users who need it."""
    status = node_status_map(sim)
    node_ids=[str(n["id"]) for n in graph.get("nodes",[]) if isinstance(n,dict) and n.get("id") is not None]
    if not node_ids:
        st.info("No nodes to display")
        return
    palette={"root":"#fb537d","broken":"#fc758d","warning":"#f0ad62","normal":"#3ac5df"}
    nodes=[Node(id=str(n["id"]),label=str(n.get("label") or n["id"]),size=30 if status.get(str(n["id"]))=="root" else 24,
                color=palette.get(status.get(str(n["id"]),"normal")),shape="star" if status.get(str(n["id"]))=="root" else "dot") for n in graph.get("nodes",[]) if isinstance(n,dict) and n.get("id") is not None]
    edges=[Edge(source=str(e["source"]),target=str(e["target"]),color="#66819c",width=1.3,dashes=e.get("dependency_type")=="soft") for e in graph.get("edges",[]) if isinstance(e,dict) and e.get("source") is not None and e.get("target") is not None]
    cfg=Config(width="100%",height=height,directed=True,physics=True,hierarchical=False,nodeHighlightBehavior=True,highlightColor="#a9f1ff")
    selection=agraph(nodes=nodes,edges=edges,config=cfg)
    if selection in node_ids:
        st.session_state.selected_node=selection


def service_details(graph, selected):
    node = next((n for n in graph.get("nodes",[]) if str(n.get("id"))==selected), {})
    edges=graph.get("edges",[])
    inbound=[str(e.get("source")) for e in edges if str(e.get("target"))==selected]
    outbound=[str(e.get("target")) for e in edges if str(e.get("source"))==selected]
    st.markdown(f'<div class="ie-card"><div class="ie-card-label">Component Inspector</div><div class="ie-card-title">{safe(selected)}</div><span class="ie-chip">SERVICE NODE</span><div class="ie-divider"></div><div class="ie-list-item"><span>Incoming links</span><em>{len(inbound)}</em></div><div class="ie-list-item"><span>Outgoing links</span><em>{len(outbound)}</em></div></div>',unsafe_allow_html=True)
    section("Connected services")
    st.markdown('<div class="ie-card"><div class="ie-card-label">Inbound / upstream</div><div class="ie-card-copy">'+safe(', '.join(inbound) if inbound else 'No recorded callers')+'</div><div class="ie-divider"></div><div class="ie-card-label">Outbound / downstream</div><div class="ie-card-copy">'+safe(', '.join(outbound) if outbound else 'No recorded dependencies')+'</div></div>',unsafe_allow_html=True)
    with st.expander("Node attributes"):
        st.json(node)


# LEFT RAIL ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown('<div class="ie-brand"><span class="ie-symbol">◈</span><div><div class="ie-brand-name">IMPACT<b>ENGINE</b></div><div class="ie-brand-sub">INFRASTRUCTURE INTELLIGENCE</div></div></div>',unsafe_allow_html=True)
    st.markdown('<div class="ie-side-label">Workspace</div>',unsafe_allow_html=True)
    page=st.radio("Navigation",PAGES,key="active_page",label_visibility="collapsed")
    st.markdown('<div class="ie-side-label">Quick launch</div>',unsafe_allow_html=True)
    with st.expander("Repository source",expanded=(st.session_state.graph_data is None)):
        st.text_input("GitHub repository URL",placeholder="https://github.com/org/repo",key="repo_url")
        st.button("Analyze repository",type="primary",on_click=analyze_repository,key="analyze_repo")
    st.button("Load E-Commerce Demo",on_click=load_demo,key="load_demo",help="Use the backend's sample architecture")
    st.markdown('<div class="ie-side-label">Workspace status</div>',unsafe_allow_html=True)
    graph=st.session_state.graph_data
    sim=st.session_state.simulation
    architecture_text="Graph loaded" if graph else "Awaiting source"
    sim_text="Analysis ready" if sim else "Not simulated"
    st.markdown(f'<div class="ie-sidebar-footer"><div><span class="ie-dot"></span>{safe(architecture_text)}</div><div>{safe(sim_text)}</div><div style="margin-top:7px;color:#5e829e">FastAPI · localhost:8000</div></div>',unsafe_allow_html=True)
    if st.button("Check API connection",key="check_api",help="Check whether the backend root endpoint is responding"):
        data=api_request("GET","/")
        st.session_state.api_check=bool(data is not None)
    if st.session_state.api_check is True:
        st.caption("Backend responded successfully")
    elif st.session_state.api_check is False:
        st.caption("Could not verify backend")


# PAGE CHROME ─────────────────────────────────────────────────────────────────
graph=st.session_state.graph_data
sim=st.session_state.simulation
m=current_stats(graph,sim)
state_label="MODEL LOADED" if graph else "AWAITING INPUT"
st.markdown(f'<div class="ie-topstrip"><div class="ie-top-left"><b>IMPACTENGINE</b>&nbsp; / &nbsp; {safe(page)}</div><div class="ie-status"><span class="ie-dot"></span>{safe(state_label)}</div></div>',unsafe_allow_html=True)

if page == "Command Center":
    page_head("Workspace / Overview","Command Center","Map service dependencies, explore architecture, and understand how failures propagate.")
    metrics([
        ("Services discovered",m["nodes"],"from current architecture"),
        ("Dependencies",m["edges"],"mapped connections"),
        ("Simulation state","Complete" if sim else "Not run","model-based analysis"),
        ("Blast radius",m["affected"] if sim else "—","affected services" if sim else "run a simulation"),
    ])
    left,right=st.columns([1.7,1],gap="large")
    with left:
        section("Architecture workspace","01 / SOURCE")
        if not graph:
            st.markdown('<div class="ie-empty"><b>Start with a service architecture</b><span>Paste a GitHub repository link in the left sidebar and analyze it, or load the built-in E-Commerce Demo to explore the product.</span></div>',unsafe_allow_html=True)
        else:
            card("Architecture indexed",str(st.session_state.last_source or "Current workspace"),f'{m["nodes"]} services and {m["edges"]} dependency relationships are ready for exploration.')
            studio_graph(graph,sim,height=360)
            st.button("Explore architecture  →",type="primary",key="goto_explorer",on_click=navigate,args=("Architecture Explorer",))
    with right:
        section("Analysis pipeline","02 / WORKFLOW")
        card("01  /  Discover","Understand your services","Ingest a repository or load a demo to build its dependency map.")
        card("02  /  Experiment","Simulate a failure","Choose a component and test a modeled crash or latency spike.")
        card("03  /  Understand","Measure the impact","Review the affected services and export the simulation results.")
        if graph:
            st.button("Run failure simulation  →",key="goto_chaos",on_click=navigate,args=("Failure Simulation",))

elif page == "Architecture Explorer":
    page_head("Workspace / Topology","Architecture Explorer","A focused view of your dependency mesh. Select any component to inspect its relationships.")
    if not graph or not graph.get("nodes"):
        st.markdown('<div class="ie-empty"><b>No architecture to explore</b><span>Use the sidebar to load the E-Commerce Demo or analyze a GitHub repository.</span></div>',unsafe_allow_html=True)
    else:
        metrics([("Services",m["nodes"],"indexed nodes"),("Connections",m["edges"],"dependency edges"),("Selected",str(st.session_state.selected_node or "—")[:18],"component"),("Risk overlay","Active" if sim else "Off","latest simulation" if sim else "not simulated")])
        left,right=st.columns([2.05,1],gap="large")
        with left:
            section("Dependency topology","SERVICE MESH")
            studio_mode=st.segmented_control("Visualization",["Studio view","Click-to-select graph"],default="Studio view",key="explorer_viz",label_visibility="collapsed")
            if studio_mode == "Click-to-select graph":
                interactive_graph(graph,sim,520)
            else:
                studio_graph(graph,sim,520)
            st.markdown('<div class="ie-legend"><span><i style="background:#43d0e8"></i>Normal</span><span><i style="background:#ff7490"></i>Failed</span><span><i style="background:#edb96d"></i>Degraded</span><span>Arrows indicate declared dependencies</span></div>',unsafe_allow_html=True)
        with right:
            section("Service inspector","SELECT A NODE")
            ids=[str(x["id"]) for x in graph["nodes"] if isinstance(x,dict) and x.get("id") is not None]
            current=str(st.session_state.selected_node)
            chosen=st.selectbox("Component",ids,index=ids.index(current) if current in ids else 0,key="inspect_node")
            st.session_state.selected_node=chosen
            service_details(graph,chosen)

elif page == "Failure Simulation":
    page_head("Workspace / Chaos sandbox","Failure Simulation","Test failure propagation in a controlled model — no changes to real infrastructure.")
    if not graph or not graph.get("nodes"):
        st.markdown('<div class="ie-empty"><b>Load an architecture first</b><span>Use the E-Commerce Demo or repository ingestion in the sidebar to begin testing.</span></div>',unsafe_allow_html=True)
    else:
        left,right=st.columns([.83,2],gap="large")
        with left:
            section("Simulation controls","CHAOS INJECTOR")
            ids=[str(x["id"]) for x in graph["nodes"] if isinstance(x,dict) and x.get("id") is not None]
            active=str(st.session_state.selected_node)
            target=st.selectbox("Target service",ids,index=ids.index(active) if active in ids else 0,key="sim_target")
            mode_label=st.radio("Failure scenario",["Hard crash · Down","Latency spike · Degraded"],key="sim_mode")
            mode="down" if mode_label.startswith("Hard") else "degraded"
            mitigations=st.multiselect("Optional: protected services",[x for x in ids if x != target],key="sim_mitigations",help="Sent as mitigated_nodes. Only effective if your backend models mitigations.")
            if st.button("Run simulation  ↗",type="primary",key="run_sim"):
                simulate(target,mode,mitigations)
                st.rerun()
            if st.button("Reset results",key="clear_sim"):
                st.session_state.simulation=None
                st.rerun()
            if sim:
                card("Latest run",str(sim.get("root_cause","Unknown")),f'{m["affected"]} services reported as affected.')
                st.button("Review impact  →",key="goto_impact",on_click=navigate,args=("Impact Analysis",))
            else:
                st.markdown('<div class="ie-empty"><b>Ready when you are</b><span>Choose a component and run the simulation to see cascading effects.</span></div>',unsafe_allow_html=True)
        with right:
            section("Blast radius preview","SIMULATION MODEL")
            studio_graph(graph,sim,540)
            st.markdown('<div class="ie-legend"><span><i style="background:#43d0e8"></i>Healthy</span><span><i style="background:#ff7790"></i>Broken / root</span><span><i style="background:#edb96d"></i>Warning</span></div>',unsafe_allow_html=True)

elif page == "Impact Analysis":
    page_head("Workspace / Post-simulation","Impact Analysis","Read the propagation path and turn simulated failures into actionable findings.")
    if not graph:
        st.markdown('<div class="ie-empty"><b>Nothing to analyze yet</b><span>Load an architecture and run a simulation first.</span></div>',unsafe_allow_html=True)
    elif not sim:
        st.markdown('<div class="ie-empty"><b>Simulation results required</b><span>Your architecture is loaded. Open Failure Simulation, choose a service, and run a scenario.</span></div>',unsafe_allow_html=True)
        st.button("Go to Failure Simulation →",type="primary",key="goto_no_sim",on_click=navigate,args=("Failure Simulation",))
    else:
        metrics([
            ("Affected services",m["affected"],f'{m["pct"]:.1f}% of indexed graph'),
            ("Hard failures",m["broken"],"reported broken nodes"),
            ("Degraded services",m["warning"],"warnings / degraded"),
            ("Failure mode",str(sim.get("failure_type","Unknown")).upper(),"model scenario"),
        ])
        st.markdown(f'<div class="ie-card"><div class="ie-card-label">Simulation root cause</div><div class="ie-card-title">{safe(sim.get("root_cause","Unknown component"))}</div><span class="ie-chip crit">SIMULATED FAILURE</span> <span class="ie-chip">{safe(sim.get("criticality","No criticality provided"))}</span></div>',unsafe_allow_html=True)
        left,right=st.columns([1.4,1],gap="large")
        with left:
            section("Blast-radius topology","AFFECTED SERVICES")
            studio_graph(graph,sim,455)
        with right:
            section("Cascade breakdown",f'{len(m["cascade"])} ENTRIES')
            if not m["cascade"]:
                st.info("No propagated failures were reported by the backend.")
            else:
                for entry in m["cascade"]:
                    state=str(entry.get("state","unknown")).lower()
                    chip_type='crit' if state=='broken' else ('warn' if state in ('warning','degraded') else '')
                    st.markdown(f'<div class="ie-service"><div class="ie-service-name">{safe(entry.get("id","Unknown service"))} &nbsp;<span class="ie-chip {chip_type}">{safe(state.upper())}</span></div><div class="ie-service-meta">Hop {safe(entry.get("hop","?"))} · {safe(entry.get("reason","No reason returned"))}</div></div>',unsafe_allow_html=True)
        section("Simulation dossier","EXPORT")
        if m["cascade"]:
            st.dataframe([
                {"Service":v.get("id",""),"State":v.get("state",""),"Hop":v.get("hop",""),"Reason":v.get("reason","")}
                for v in m["cascade"]
            ],use_container_width=True,hide_index=True)
        report={"source":st.session_state.last_source,"exported_at":datetime.now(timezone.utc).isoformat(),
                "nodes":m["nodes"],"edges":m["edges"],"simulation":sim}
        dl,reset=st.columns([1,1],gap="medium")
        with dl:
            st.download_button("Download impact report",json.dumps(report,indent=2,default=str),file_name="impactengine_report.json",mime="application/json",key="download_report")
        with reset:
            if st.button("Clear simulation",key="reset_impact"):
                st.session_state.simulation=None
                st.rerun()

st.markdown('<div class="ie-subline">IMPACTENGINE / MODELED INFRASTRUCTURE ANALYSIS · Not live system telemetry</div>', unsafe_allow_html=True)
