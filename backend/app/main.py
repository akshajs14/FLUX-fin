from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    AIQuery,
    AIResponse,
    CityForecast,
    CityMetrics,
    EnergyFlowResponse,
    Recommendation,
    SimulateInput,
)
from .simulation import state

app = FastAPI(title="Flux Grid API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_last_cities: list[CityMetrics] = []


def _refresh(body: SimulateInput | None = None) -> list[CityMetrics]:
    global _last_cities
    if body is not None:
        state.set_params(body)
    _last_cities = state.compute_cities()
    return _last_cities


@app.on_event("startup")
def startup() -> None:
    _refresh()


@app.get("/city-state", response_model=list[CityMetrics])
def city_state() -> list[CityMetrics]:
    if not _last_cities:
        _refresh()
    return _last_cities


@app.post("/simulate", response_model=list[CityMetrics])
def simulate(body: SimulateInput) -> list[CityMetrics]:
    return _refresh(body)


@app.get("/forecast", response_model=list[CityForecast])
def forecast() -> list[CityForecast]:
    if not _last_cities:
        _refresh()
    return state.forecast(_last_cities)


@app.get("/energy-flow", response_model=EnergyFlowResponse)
def energy_flow() -> EnergyFlowResponse:
    if not _last_cities:
        _refresh()
    flows = state.compute_flows(_last_cities)
    return EnergyFlowResponse(flows=flows)


@app.get("/recommendations", response_model=list[Recommendation])
def recommendations() -> list[Recommendation]:
    if not _last_cities:
        _refresh()
    flows = state.compute_flows(_last_cities)
    return state.recommendations(_last_cities, flows)


@app.post("/ai-query", response_model=AIResponse)
def ai_query(body: AIQuery) -> AIResponse:
    if not _last_cities:
        _refresh()
    flows = state.compute_flows(_last_cities)
    text, structured = state.answer_ai(body.query, _last_cities, flows)
    return AIResponse(answer=text, structured=structured)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
