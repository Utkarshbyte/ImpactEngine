import networkx as nx
from typing import List
from app.models import GraphData, PropagationType


class GraphEngine:
    def __init__(self, graph_data: GraphData):
        self.graph_data = graph_data
        self.graph = self._build_graph(graph_data)

    def _build_graph(self, graph_data: GraphData) -> nx.DiGraph:
        G = nx.DiGraph()
        for node in graph_data.nodes:
            G.add_node(
                node.id,
                name=node.name,
                type=node.type,
                criticality=node.criticality,
                health=node.health,
                base_latency_ms=node.base_latency_ms,
                sla_ms=node.sla_ms,
                business_functions=list(node.business_functions),
            )
        for idx, edge in enumerate(graph_data.edges):
            edge_id = edge.id or f"e-{edge.source}-{edge.target}-{idx}"
            G.add_edge(
                edge.source,
                edge.target,
                id=edge_id,
                dependency=edge.dependency,
                propagation=edge.propagation,
                weight=edge.weight,
            )
        return G

    def apply_mitigations(self, mitigated_nodes: List[str]) -> None:
        if not mitigated_nodes:
            return
        mitigated_set = set(mitigated_nodes)
        for u, v, data in self.graph.edges(data=True):
            if u in mitigated_set or v in mitigated_set:
                if data.get("propagation") == PropagationType.HARD:
                    data["propagation"] = PropagationType.SOFT