import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from app.models import (
    FailureType,
    GraphData,
    ScenarioCreate,
    ScenarioResponse,
    SimulationResult,
)

BASE_DIR = Path(__file__).resolve().parents[2]  # backend/
DB_PATH = BASE_DIR / "impactx.db"


def _find_seed_file() -> Path:
    candidates = [
        BASE_DIR.parent / "data" / "demo_infrastructure.json",
        BASE_DIR / "data" / "demo_infrastructure.json",
        Path("../data/demo_infrastructure.json"),
    ]
    for path in candidates:
        if path.exists():
            return path
    raise FileNotFoundError("Could not locate data/demo_infrastructure.json")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS graphs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            graph_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS scenarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            failure_node TEXT NOT NULL,
            failure_type TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS simulation_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            graph_id TEXT NOT NULL,
            failure_node TEXT NOT NULL,
            failure_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            blast_radius_pct INTEGER NOT NULL,
            result_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # Seed default graph if empty
    cur.execute("SELECT COUNT(*) FROM graphs")
    if cur.fetchone()[0] == 0:
        seed_path = _find_seed_file()
        raw_graph = json.loads(seed_path.read_text(encoding="utf-8"))
        graph_obj = GraphData(**raw_graph)
        now = datetime.now(timezone.utc).isoformat()
        cur.execute(
            "INSERT INTO graphs (id, name, graph_json, updated_at) VALUES (?, ?, ?, ?)",
            (graph_obj.id, graph_obj.name, graph_obj.model_dump_json(), now),
        )

    # Seed 3 contrasting demo scenarios if empty
    cur.execute("SELECT COUNT(*) FROM scenarios")
    if cur.fetchone()[0] == 0:
        now = datetime.now(timezone.utc).isoformat()
        starter_scenarios = [
            (
                "Payment Gateway Outage",
                "Critical synchronous dependency failure impacting checkout and downstream revenue.",
                "payment",
                FailureType.DOWN.value,
                now,
            ),
            (
                "Primary DB 10x Latency Spike",
                "Database slowdown causing SLA timeouts on strict services while high-SLA services degrade.",
                "postgres",
                FailureType.LATENCY.value,
                now,
            ),
            (
                "Analytics Pipeline Crash",
                "Isolated non-critical consumer outage with zero upstream blast radius.",
                "analytics",
                FailureType.DOWN.value,
                now,
            ),
        ]
        cur.executemany(
            """
            INSERT INTO scenarios (name, description, failure_node, failure_type, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            starter_scenarios,
        )

    conn.commit()
    conn.close()


def get_graph(graph_id: str = "ecommerce-core") -> Optional[GraphData]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT graph_json FROM graphs WHERE id = ?", (graph_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return GraphData(**json.loads(row["graph_json"]))


def save_graph(graph: GraphData) -> GraphData:
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    cur.execute(
        """
        INSERT INTO graphs (id, name, graph_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            graph_json = excluded.graph_json,
            updated_at = excluded.updated_at
        """,
        (graph.id, graph.name, graph.model_dump_json(), now),
    )
    conn.commit()
    conn.close()
    return graph


def list_scenarios() -> List[ScenarioResponse]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM scenarios ORDER BY id ASC")
    rows = cur.fetchall()
    conn.close()
    return [
        ScenarioResponse(
            id=r["id"],
            name=r["name"],
            description=r["description"] or "",
            failure_node=r["failure_node"],
            failure_type=FailureType(r["failure_type"]),
            created_at=r["created_at"],
        )
        for r in rows
    ]


def create_scenario(payload: ScenarioCreate) -> ScenarioResponse:
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    cur.execute(
        """
        INSERT INTO scenarios (name, description, failure_node, failure_type, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (payload.name, payload.description, payload.failure_node, payload.failure_type.value, now),
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return ScenarioResponse(
        id=new_id,
        name=payload.name,
        description=payload.description or "",
        failure_node=payload.failure_node,
        failure_type=payload.failure_type,
        created_at=now,
    )


def save_simulation_run(graph_id: str, result: SimulationResult) -> None:
    conn = get_connection()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    cur.execute(
        """
        INSERT INTO simulation_results
        (graph_id, failure_node, failure_type, severity, blast_radius_pct, result_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            graph_id,
            result.scenario.node,
            result.scenario.failure.value,
            result.severity,
            result.blast_radius.percentage,
            result.model_dump_json(),
            now,
        ),
    )
    conn.commit()
    conn.close()


def get_recent_simulations(limit: int = 10) -> List[dict]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, graph_id, failure_node, failure_type, severity, blast_radius_pct, created_at
        FROM simulation_results
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows