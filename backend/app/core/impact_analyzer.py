from typing import Dict, List
import networkx as nx
from app.models import (
    AffectedNodeDetail,
    BlastRadiusMetrics,
    FailureEvent,
    HealthState,
    PropagationStep,
    ScenarioSummary,
    SimulationResult,
)


class ImpactAnalyzer:
    def analyze(
        self,
        graph: nx.DiGraph,
        event: FailureEvent,
        initial_state: HealthState,
        affected_map: Dict[str, AffectedNodeDetail],
        propagation_path: List[str],
        propagation_steps: List[PropagationStep],
        affected_edge_ids: List[str],
    ) -> SimulationResult:
        root_data = graph.nodes[event.node]
        affected_list = sorted(
            affected_map.values(),
            key=lambda n: (n.hop, 0 if n.state == HealthState.DOWN else 1, -n.criticality),
        )

        total_nodes = len(graph.nodes)
        affected_count = len(affected_list)
        down_count = sum(1 for n in affected_list if n.state == HealthState.DOWN)
        degraded_count = sum(1 for n in affected_list if n.state == HealthState.DEGRADED)
        blast_pct = round((affected_count / max(total_nodes, 1)) * 100)

        # Deduplicated business functions impacted across root + affected services
        business_impact: List[str] = []
        for fn in root_data.get("business_functions", []):
            if fn not in business_impact:
                business_impact.append(fn)
        for node in affected_list:
            for fn in node.business_functions:
                if fn not in business_impact:
                    business_impact.append(fn)

        # Weighted criticality score (0.0 - 10.0)
        root_weight = root_data["criticality"] * (1.0 if initial_state == HealthState.DOWN else 0.6)
        downstream_weight = sum(
            n.criticality * (1.0 if n.state == HealthState.DOWN else 0.5)
            for n in affected_list
        )
        max_possible = sum(graph.nodes[nid]["criticality"] for nid in graph.nodes)
        criticality_score = round(min(((root_weight + downstream_weight) / max(max_possible, 1)) * 10.0, 10.0), 1)

        if down_count >= 2 or criticality_score >= 6.5:
            severity = "CRITICAL"
        elif down_count >= 1 or criticality_score >= 4.0:
            severity = "HIGH"
        elif affected_count >= 1 or criticality_score >= 1.5:
            severity = "MEDIUM"
        else:
            severity = "LOW"

        return SimulationResult(
            scenario=ScenarioSummary(
                node=event.node,
                node_name=root_data["name"],
                failure=event.state,
            ),
            blast_radius=BlastRadiusMetrics(
                affected=affected_count,
                down_count=down_count,
                degraded_count=degraded_count,
                total=total_nodes,
                percentage=blast_pct,
            ),
            severity=severity,
            criticality_score=criticality_score,
            affected_nodes=affected_list,
            business_impact=business_impact,
            propagation_path=propagation_path,
            propagation_steps=propagation_steps,
            affected_edge_ids=affected_edge_ids,
        )