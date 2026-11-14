from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class FailureType(str, Enum):
    DOWN = "DOWN"          # 100% unavailable
    DEGRADED = "DEGRADED"  # Partial outage / elevated error rate
    LATENCY = "LATENCY"    # 10x latency slowdown


class FailureEvent(BaseModel):
    node: str
    state: FailureType = FailureType.DOWN
    latency_multiplier: float = Field(default=10.0, ge=1.0, le=50.0)


class SimulateRequest(BaseModel):
    graph_id: str = "ecommerce-core"
    node: str
    failure: FailureType = FailureType.DOWN
    latency_multiplier: float = Field(default=10.0, ge=1.0, le=50.0)
    mitigated_nodes: List[str] = Field(default_factory=list)


class ScenarioCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    failure_node: str
    failure_type: FailureType = FailureType.DOWN


class ScenarioResponse(ScenarioCreate):
    id: int
    created_at: str