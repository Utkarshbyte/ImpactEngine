# ImpactEngine

ImpactEngine is an infrastructure failure simulation and blast-radius analysis tool. Given a service dependency graph, it lets you inject failures into any node and immediately see which downstream services break, degrade, or survive — along with a weighted criticality score and business impact summary.

---

## Overview

Modern distributed systems fail in non-obvious ways. A single database slowdown can cascade through five services before it surfaces to the user. ImpactEngine models that propagation explicitly: you define (or load) a graph of services and their dependency types, pick a failure mode, and the engine traces the full blast radius hop by hop.

**Failure modes supported:**
- `DOWN` — hard crash, service completely unavailable
- `LATENCY` — 10x latency spike, triggers SLA timeout propagation

**Dependency types:**
- `HARD` — synchronous/blocking; a failure propagates downstream immediately
- `SOFT` — async/fallback; a failure degrades but does not break the caller
- `OPTIONAL` — absorbs failures without propagating

**Output per simulation:**
- Affected node list with state (`DOWN` / `DEGRADED`), hop depth, and failure reason
- Blast radius count and percentage
- Weighted criticality score (0–10) and severity label (`LOW` / `MEDIUM` / `HIGH` / `CRITICAL`)
- Deduplicated list of impacted business functions
- Step-by-step propagation path
- LLM-generated incident explanation and architectural recommendations (optional, requires Prune API key)

---

## Architecture

```
ImpactEngine/
├── backend/                  # FastAPI service (ImpactX Core API)
│   └── app/
│       ├── api/              # Route handlers: graph, scenarios, simulation
│       ├── core/             # Propagation and analysis engines
│       │   ├── propagation_engine.py
│       │   ├── impact_analyzer.py
│       │   ├── graph_engine.py
│       │   └── failure_engine.py
│       ├── db/               # SQLite persistence (graphs, scenarios, runs)
│       └── models/           # Pydantic models
├── Frontend/                 # React + TypeScript UI (Vite)
│   └── src/
│       ├── App.tsx           # Main application
│       └── engine.ts         # Client-side simulation logic
├── data/
│   └── demo_infrastructure.json   # Seed graph (e-commerce stack)
├── app.py                    # Streamlit UI (alternative interface)
├── api.py                    # Standalone FastAPI entrypoint (lightweight)
└── core.py                   # Standalone blast-radius engine
```

The backend exposes a REST API consumed by both the React frontend and the Streamlit interface. Simulation results are persisted to a local SQLite database (`impactx.db`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Python, FastAPI, Uvicorn |
| Simulation engine | NetworkX (directed graph traversal) |
| Data validation | Pydantic v2 |
| Persistence | SQLite |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Alternative UI | Streamlit |
| LLM integration | Gemini (via Prune API proxy) — optional |
| Codebase ingestion | TinyFish API — optional |

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. On first run, the database is initialized and seeded with the demo e-commerce graph and three starter scenarios.

### Frontend

```bash
cd Frontend
npm install
npm run dev
```

The UI runs on `http://localhost:3000` and connects to the backend at port 8000.

### Alternative: Streamlit UI

```bash
pip install -r requirements.txt
streamlit run app.py
```

Requires the backend to be running on port 8000.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `GET` | `/graph?graph_id=<id>` | Load a saved infrastructure graph |
| `GET` | `/scenarios` | List saved failure scenarios |
| `POST` | `/scenarios` | Create a new scenario |
| `POST` | `/simulate` | Run a failure simulation |
| `GET` | `/impact?limit=<n>` | Fetch recent simulation history |
| `POST` | `/explain` | Generate LLM incident explanation for a result |

### Simulate request body

```json
{
  "graph_id": "ecommerce-core",
  "node": "<node_id>",
  "failure": "DOWN",
  "mitigated_nodes": ["<node_id>"]
}
```

`mitigated_nodes` simulates circuit breakers: any hard dependency touching a mitigated node is downgraded to soft before propagation runs.

---

## Environment Variables

Create a `.env` file in the project root if you want LLM-powered explanations or live codebase ingestion. Both are optional — the tool is fully functional without them.

```env
PRUNE_API_KEY=     # Gemini (via Prune proxy) — for /explain endpoint
TINYFISH_API_KEY=  # For GitHub codebase ingestion and auto graph extraction
```

---

## Demo

The seeded e-commerce graph includes 12 nodes: Web Frontend, Mobile App, API Gateway, Auth Service, Checkout Service, Order Service, Payment API, Inventory Service, Primary Postgres DB, Redis Session Cache, Revenue Pipeline, and Analytics Engine.

Three pre-built scenarios are included:

- **Payment Gateway Outage** — cascades through Checkout and Order services, blocks revenue
- **Primary DB 10x Latency Spike** — triggers SLA timeouts on strict services, degrades others
- **Analytics Pipeline Crash** — isolated non-critical consumer, zero upstream blast radius

---

## License

MIT
