import networkx as nx
from typing import Tuple
from app.models import FailureEvent, FailureType, HealthState, SimulateRequest


class FailureEngine:
    def create_event(self, graph: nx.DiGraph, request: SimulateRequest) -> FailureEvent:
        if request.node not in graph:
            raise ValueError(f"Component '{request.node}' does not exist in graph '{request.graph_id}'.")
        return FailureEvent(
            node=request.node,
            state=request.failure,
            latency_multiplier=request.latency_multiplier,
        )

    def get_initial_impact(self, graph: nx.DiGraph, event: FailureEvent) -> Tuple[HealthState, int]:
        base_lat = graph.nodes[event.node]["base_latency_ms"]
        if event.state == FailureType.DOWN:
            return HealthState.DOWN, 0
        if event.state == FailureType.LATENCY:
            added_latency = int(base_lat * (event.latency_multiplier - 1.0))
            return HealthState.DEGRADED, max(added_latency, 1)
        return HealthState.DEGRADED, 0.