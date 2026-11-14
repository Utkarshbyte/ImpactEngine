from typing import List
from fastapi import APIRouter
from app.db.database import create_scenario, list_scenarios
from app.models import ScenarioCreate, ScenarioResponse

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])


@router.get("", response_model=List[ScenarioResponse])
def get_scenarios():
    return list_scenarios()


@router.post("", response_model=ScenarioResponse)
def add_scenario(payload: ScenarioCreate):
    return create_scenario(payload)