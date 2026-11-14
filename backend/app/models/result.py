from typing import List, Optional
from pydantic import BaseModel
from .failure import FailureType
from .graph import HealthState


class ScenarioSummary(BaseModel):
    node: str
    node_name: str
    failure: FailureType


class BlastRadiusMetrics(BaseModel):
    affected: int
    down_count: int
    degraded_count: int
    total: int
    percentage: int


class AffectedNodeDetail(BaseModel):
    id: str
    name: str
    type: str
    criticality: int
    state: HealthState
    hop: int
    simulated_latency_ms: Optional[int] = None
    reason: str
    business_functions: List[str] = []


class PropagationStep(BaseModel):
    step: int
    delay_ms: int
    from_node: Optional[str] = None
    to_node: str
    edge_id: Optional[str] = None
    state: HealthState
    reason: str


class SimulationResult(BaseModel):
    scenario: ScenarioSummary
    blast_radius: BlastRadiusMetrics
    severity: str               # LOW | MEDIUM | HIGH | CRITICAL
    criticality_score: float    # Weighted 0.0 - 10.0 score
    affected_nodes: List[AffectedNodeDetail]
    business_impact: List[str]
    propagation_path: List[str]
    propagation_steps: List[PropagationStep]
    affected_edge_ids: List[str]


class ExplainResponse(BaseModel):
    explanation: str
    recommendations: List[str]