from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SimulateInput(BaseModel):
    temperature: float = Field(default=72.0, ge=50, le=110, description="Fahrenheit")
    solar_factor: float = Field(default=1.0, ge=0.0, le=2.0)
    ev_multiplier: float = Field(default=1.0, ge=0.5, le=2.5)
    data_center_multiplier: float = Field(default=1.0, ge=0.5, le=2.5)


class CityMetrics(BaseModel):
    name: str
    lat: float
    lon: float
    demand_mw: float
    renewable_mw: float
    storage_level_pct: float
    storage_capacity_mw: float
    risk_score: float
    risk_level: Literal["low", "medium", "high", "critical"]
    available_support_mw: float


class ForecastPoint(BaseModel):
    hour_offset: int
    predicted_demand_mw: float


class CityForecast(BaseModel):
    city: str
    points: list[ForecastPoint]


class EnergyFlow(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    from_city: str = Field(alias="from")
    to_city: str = Field(alias="to")
    mw: float


class EnergyFlowResponse(BaseModel):
    flows: list[EnergyFlow]


class Recommendation(BaseModel):
    priority: Literal["info", "warning", "critical"]
    title: str
    detail: str


class AIQuery(BaseModel):
    query: str


class AIResponse(BaseModel):
    answer: str
    structured: dict
