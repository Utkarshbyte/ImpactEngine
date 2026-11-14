from fastapi import APIRouter, HTTPException
from app.db.database import get_graph, save_graph
from app.models import GraphData

router = APIRouter(prefix="/graph", tags=["Graph"])


@router.get("", response_model=GraphData)
def fetch_default_graph(graph_id: str = "ecommerce-core"):
    graph = get_graph(graph_id)
    if not graph:
        raise HTTPException(status_code=404, detail=f"Graph '{graph_id}' not found.")
    return graph


@router.post("", response_model=GraphData)
def upload_graph(graph: GraphData):
    return save_graph(graph)