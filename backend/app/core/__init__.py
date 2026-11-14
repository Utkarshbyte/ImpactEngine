from app.models import GraphData, SimulateRequest, SimulationResult
from .graph_engine import GraphEngine
from .failure_engine import FailureEngine
from .propagation_engine import PropagationEngine
from .impact_analyzer import ImpactAnalyzer


def run_simulation(graph_data: GraphData, request: SimulateRequest) -> SimulationResult:
    graph_engine = GraphEngine(graph_data)
    graph_engine.apply_mitigations(request.mitigated_nodes)

    failure_engine = FailureEngine()
    event = failure_engine.create_event(graph_engine.graph, request)
    initial_state, initial_added_lat = failure_engine.get_initial_impact(graph_engine.graph, event)

    propagation_engine = PropagationEngine()
    affected_map, path, steps, edge_ids = propagation_engine.propagate(
        graph=graph_engine.graph,
        event=event,
        initial_state=initial_state,
        initial_added_latency=initial_added_lat,
    )

    analyzer = ImpactAnalyzer()
    return analyzer.analyze(
        graph=graph_engine.graph,
        event=event,
        initial_state=initial_state,
        affected_map=affected_map,
        propagation_path=path,
        propagation_steps=steps,
        affected_edge_ids=edge_ids,
    )