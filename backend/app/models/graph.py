from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class HealthState(str, Enum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    DOWN = "DOWN"


class PropagationType(str, Enum):
    HARD = "HARD"          # Failure propagates as DOWN (or SLA timeout check)
    SOFT = "SOFT"          # Failure propagates as DEGRADED
    OPTIONAL = "OPTIONAL"  # Failure is absorbed (NONE)


class Position(BaseModel):
    x: float = 0.0
    y: float = 0.0


class NodeModel(BaseModel):
    id: str
    name: str
    type: str = "service"
    criticality: int = Field(default=3, ge=1, le=5)
    health: HealthState = HealthState.HEALTHY
    base_latency_ms: int = Field(default=30, ge=1)
    sla_ms: int = Field(default=500, ge=10)
    business_functions: List[str] = Field(default_factory=list)
    position: Optional[Position] = None


class EdgeModel(BaseModel):
    id: Optional[str] = None
    source: str
    target: str
    dependency: str = "critical"  # critical | important | non-critical
    propagation: PropagationType = PropagationType.HARD
    weight: float = Field(default=1.0, ge=0.0, le=1.0)


class GraphData(BaseModel):
    id: str = "default"
    name: str = "Infrastructure Topology"
    nodes: List[NodeModel]
    edges: List[EdgeModel]