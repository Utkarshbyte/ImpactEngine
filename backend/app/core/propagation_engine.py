from collections import deque
from typing import Dict, List, Tuple
import networkx as nx
from app.models import (
    AffectedNodeDetail,
    FailureEvent,
    HealthState,
    PropagationStep,
    PropagationType,
)


class PropagationEngine:
    STEP_DELAY_MS = 200

    def propagate(
        self,
        graph: nx.DiGraph,
        event: FailureEvent,
        initial_state: HealthState,
        initial_added_latency: int,
    ) -> Tuple[Dict[str, AffectedNodeDetail], List[str], List[PropagationStep], List[str]]:
        root = event.node
        root_name = graph.nodes[root]["name"]
        max_hops = len(graph.nodes)

        affected: Dict[str, AffectedNodeDetail] = {}
        affected_edge_ids: List[str] = []
        propagation_path: List[str] = [root]

        steps: List[PropagationStep] = [
            PropagationStep(
                step=0,
                delay_ms=0,
                from_node=None,
                to_node=root,
                edge_id=None,
                state=initial_state,
                reason=f"Injected {event.state.value} failure on {root_name}",
            )
        ]

        # Queue tuple: (current_node_id, current_state, added_latency_ms, hop_depth)
        queue = deque([(root, initial_state, initial_added_latency, 0)])

        while queue:
            curr, curr_state, added_lat, hop = queue.popleft()
            if hop >= max_hops:
                continue

            curr_name = graph.nodes[curr]["name"]

            for target in graph.successors(curr):
                if target == root:
                    continue

                edge_data = graph.edges[curr, target]
                prop_rule = edge_data.get("propagation", PropagationType.HARD)
                edge_id = edge_data.get("id")

                # OPTIONAL dependencies absorb failures without propagating
                if prop_rule == PropagationType.OPTIONAL:
                    continue

                target_data = graph.nodes[target]
                target_base_lat = target_data["base_latency_ms"]
                target_sla = target_data["sla_ms"]

                new_state, new_added_lat, reason = self._evaluate_edge(
                    curr_name=curr_name,
                    curr_state=curr_state,
                    added_lat=added_lat,
                    prop_rule=prop_rule,
                    target_base_lat=target_base_lat,
                    target_sla=target_sla,
                )

                if edge_id and edge_id not in affected_edge_ids:
                    affected_edge_ids.append(edge_id)

                next_hop = hop + 1
                existing = affected.get(target)
                should_update = (
                    existing is None
                    or (existing.state == HealthState.DEGRADED and new_state == HealthState.DOWN)
                )

                if should_update:
                    sim_lat = None if new_state == HealthState.DOWN else (target_base_lat + new_added_lat)
                    affected[target] = AffectedNodeDetail(
                        id=target,
                        name=target_data["name"],
                        type=target_data["type"],
                        criticality=target_data["criticality"],
                        state=new_state,
                        hop=next_hop,
                        simulated_latency_ms=sim_lat,
                        reason=reason,
                        business_functions=target_data["business_functions"],
                    )

                    if target not in propagation_path:
                        propagation_path.append(target)

                    steps.append(
                        PropagationStep(
                            step=len(steps),
                            delay_ms=next_hop * self.STEP_DELAY_MS,
                            from_node=curr,
                            to_node=target,
                            edge_id=edge_id,
                            state=new_state,
                            reason=reason,
                        )
                    )
                    queue.append((target, new_state, new_added_lat, next_hop))

        return affected, propagation_path, steps, affected_edge_ids

    def _evaluate_edge(
        self,
        curr_name: str,
        curr_state: HealthState,
        added_lat: int,
        prop_rule: PropagationType,
        target_base_lat: int,
        target_sla: int,
    ) -> Tuple[HealthState, int, str]:
        if curr_state == HealthState.DOWN:
            if prop_rule == PropagationType.HARD:
                return (
                    HealthState.DOWN,
                    0,
                    f"Critical HARD dependency '{curr_name}' is DOWN",
                )
            return (
                HealthState.DEGRADED,
                0,
                f"SOFT dependency '{curr_name}' is DOWN (running on degraded fallback)",
            )

        # Upstream is DEGRADED (either partial outage or latency spike)
        if added_lat > 0:
            if prop_rule == PropagationType.HARD:
                total_lat = target_base_lat + added_lat
                if total_lat > target_sla:
                    return (
                        HealthState.DOWN,
                        added_lat,
                        f"SLA timeout ({total_lat}ms > {target_sla}ms) caused by '{curr_name}'",
                    )
                return (
                    HealthState.DEGRADED,
                    added_lat,
                    f"Latency spike ({total_lat}ms / {target_sla}ms SLA) from '{curr_name}'",
                )
            damped_lat = int(added_lat * 0.25)
            return (
                HealthState.DEGRADED,
                damped_lat,
                f"Async queue lag (+{damped_lat}ms) from '{curr_name}'",
            )

        return (
            HealthState.DEGRADED,
            0,
            f"Upstream {prop_rule.value} dependency '{curr_name}' is DEGRADED",
        )