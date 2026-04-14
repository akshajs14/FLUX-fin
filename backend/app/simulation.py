"""
Synthetic grid simulation for Flux demo — no external ML.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Literal

from .models import (
    CityForecast,
    CityMetrics,
    EnergyFlow,
    ForecastPoint,
    Recommendation,
    SimulateInput,
)

# Exact city list — base demand MW (peak-ish synthetic scale), lat/lon, region weight for solar
CITY_SPECS: list[dict] = [
    {"name": "New York City", "base_mw": 5200, "lat": 40.7128, "lon": -74.0060, "solar_w": 0.35},
    {"name": "Los Angeles", "base_mw": 3800, "lat": 34.0522, "lon": -118.2437, "solar_w": 1.15},
    {"name": "Chicago", "base_mw": 3100, "lat": 41.8781, "lon": -87.6298, "solar_w": 0.55},
    {"name": "Houston", "base_mw": 2900, "lat": 29.7604, "lon": -95.3698, "solar_w": 0.85},
    {"name": "Phoenix", "base_mw": 2100, "lat": 33.4484, "lon": -112.0740, "solar_w": 1.25},
    {"name": "Philadelphia", "base_mw": 2400, "lat": 39.9526, "lon": -75.1652, "solar_w": 0.45},
    {"name": "San Antonio", "base_mw": 1800, "lat": 29.4241, "lon": -98.4936, "solar_w": 0.95},
    {"name": "San Diego", "base_mw": 1700, "lat": 32.7157, "lon": -117.1611, "solar_w": 1.1},
    {"name": "Dallas", "base_mw": 2600, "lat": 32.7767, "lon": -96.7970, "solar_w": 0.9},
    {"name": "San Jose", "base_mw": 1600, "lat": 37.3382, "lon": -121.8863, "solar_w": 1.05},
]

RISK_THRESHOLDS = (50.0, 150.0, 300.0)


def _risk_level(score: float) -> Literal["low", "medium", "high", "critical"]:
    if score < RISK_THRESHOLDS[0]:
        return "low"
    if score < RISK_THRESHOLDS[1]:
        return "medium"
    if score < RISK_THRESHOLDS[2]:
        return "high"
    return "critical"


@dataclass
class SimulationState:
    params: SimulateInput = field(default_factory=SimulateInput)
    rng_seed: int = 42

    def __post_init__(self) -> None:
        self._rng = random.Random(self.rng_seed)

    def set_params(self, p: SimulateInput) -> None:
        self.params = p

    def _temp_factor(self, t: float) -> float:
        # AC load above ~72°F, heating below ~55°F (simplified)
        if t > 72:
            return 1.0 + (t - 72) * 0.012
        if t < 55:
            return 1.0 + (55 - t) * 0.008
        return 1.0

    def compute_cities(self) -> list[CityMetrics]:
        p = self.params
        tf = self._temp_factor(p.temperature)
        cities: list[CityMetrics] = []

        for spec in CITY_SPECS:
            base = spec["base_mw"]
            demand = (
                base
                * tf
                * p.ev_multiplier
                * p.data_center_multiplier
                * (1.0 + self._rng.uniform(-0.02, 0.02))
            )

            # Renewable: solar curve * regional weight * solar_factor + small wind baseline
            solar_idx = spec["solar_w"]
            renewable = (
                base
                * 0.22
                * solar_idx
                * p.solar_factor
                * (1.0 - max(0, (p.temperature - 85)) * 0.015)
            )
            renewable += base * 0.06 * self._rng.uniform(0.9, 1.1)

            cap = max(400.0, base * 0.18)
            # Storage level reacts to imbalance (synthetic)
            imbalance = demand - renewable
            target_pct = max(15.0, min(95.0, 70.0 - imbalance / base * 25.0))
            storage_pct = target_pct + self._rng.uniform(-5, 5)

            max_discharge = cap * 0.85
            available_support = (storage_pct / 100.0) * max_discharge + base * 0.04

            risk_score = demand - renewable - available_support
            risk_score = max(0.0, risk_score)

            cities.append(
                CityMetrics(
                    name=spec["name"],
                    lat=spec["lat"],
                    lon=spec["lon"],
                    demand_mw=round(demand, 1),
                    renewable_mw=round(renewable, 1),
                    storage_level_pct=round(storage_pct, 1),
                    storage_capacity_mw=round(cap, 1),
                    risk_score=round(risk_score, 1),
                    risk_level=_risk_level(risk_score),
                    available_support_mw=round(available_support, 1),
                )
            )
        return cities

    def compute_flows(self, cities: list[CityMetrics]) -> list[EnergyFlow]:
        """Route from surplus cities to high/critical deficit cities."""
        specs = {s["name"]: s for s in CITY_SPECS}

        def surplus(c: CityMetrics) -> float:
            net = c.renewable_mw + c.available_support_mw * 0.35 - c.demand_mw * 0.92
            return max(0.0, net)

        def need(c: CityMetrics) -> float:
            if c.risk_level not in ("high", "critical"):
                return 0.0
            return c.risk_score * 0.85

        senders = sorted(
            [c for c in cities if surplus(c) > 10],
            key=surplus,
            reverse=True,
        )
        receivers = sorted(
            [c for c in cities if need(c) > 5],
            key=lambda x: x.risk_score,
            reverse=True,
        )

        flows: list[EnergyFlow] = []
        remaining = {c.name: surplus(c) for c in senders}

        def dist(a: str, b: str) -> float:
            la, lo = specs[a]["lat"], specs[a]["lon"]
            lb, lob = specs[b]["lat"], specs[b]["lon"]
            return math.sqrt((la - lb) ** 2 + (lo - lob) ** 2)

        for recv in receivers:
            target = need(recv)
            if target <= 0:
                continue
            donors = sorted(
                senders,
                key=lambda d: (dist(d.name, recv.name), -surplus(d)),
            )
            for donor in donors:
                if target <= 0:
                    break
                cap_left = remaining.get(donor.name, 0.0)
                if cap_left <= 0:
                    continue
                # Prefer geographically closer transfers
                transfer = min(cap_left, target, 800.0)
                if transfer < 8:
                    continue
                flows.append(
                    EnergyFlow(
                        from_city=donor.name,
                        to_city=recv.name,
                        mw=round(transfer, 1),
                    )
                )
                remaining[donor.name] = cap_left - transfer
                target -= transfer

        return flows

    def forecast(self, cities: list[CityMetrics]) -> list[CityForecast]:
        out: list[CityForecast] = []
        p = self.params
        for c in cities:
            pts = []
            for h in (1, 2, 3):
                drift = 1.0 + h * 0.012 * p.ev_multiplier + (p.temperature - 72) * 0.001 * h
                noise = self._rng.uniform(0.98, 1.03)
                pred = c.demand_mw * drift * noise
                pts.append(ForecastPoint(hour_offset=h, predicted_demand_mw=round(pred, 1)))
            out.append(CityForecast(city=c.name, points=pts))
        return out

    def recommendations(self, cities: list[CityMetrics], flows: list[EnergyFlow]) -> list[Recommendation]:
        recs: list[Recommendation] = []
        critical = [c for c in cities if c.risk_level == "critical"]
        high = [c for c in cities if c.risk_level == "high"]

        if critical:
            recs.append(
                Recommendation(
                    priority="critical",
                    title="Critical congestion",
                    detail=f"Immediate load shedding or import contracts required for: {', '.join(c.name for c in critical)}.",
                )
            )
        if high and not critical:
            recs.append(
                Recommendation(
                    priority="warning",
                    title="Elevated grid stress",
                    detail=f"Pre-stage demand response in: {', '.join(c.name for c in high)}.",
                )
            )

        total_flow = sum(f.mw for f in flows)
        if total_flow > 100:
            recs.append(
                Recommendation(
                    priority="info",
                    title="Inter-city transfers active",
                    detail=f"~{total_flow:.0f} MW being redistributed across {len(flows)} corridors.",
                )
            )

        low_storage = [c for c in cities if c.storage_level_pct < 25]
        if low_storage:
            recs.append(
                Recommendation(
                    priority="warning",
                    title="Low storage buffers",
                    detail=f"Consider charging windows: {', '.join(c.name for c in low_storage[:4])}.",
                )
            )

        if not recs:
            recs.append(
                Recommendation(
                    priority="info",
                    title="Grid stable",
                    detail="No immediate operator actions required under current scenario.",
                )
            )
        return recs

    def answer_ai(self, query: str, cities: list[CityMetrics], flows: list[EnergyFlow]) -> tuple[str, dict]:
        q = query.lower().strip()
        structured: dict = {}

        most_risk = max(cities, key=lambda c: c.risk_score)
        lowest_risk = min(cities, key=lambda c: c.risk_score)

        if "most at risk" in q or "highest risk" in q or "which city" in q and "risk" in q:
            structured = {"city": most_risk.name, "risk_score": most_risk.risk_score, "level": most_risk.risk_level}
            return (
                f"{most_risk.name} is under the most stress right now (risk score {most_risk.risk_score:.0f}, {most_risk.risk_level}).",
                structured,
            )

        if "route" in q or "where should power" in q or "redirect" in q:
            top = flows[:5]
            structured = {
                "flows": [{"from": f.from_city, "to": f.to_city, "mw": f.mw} for f in top]
            }
            if not flows:
                return ("No major transfers are modeled — surplus is adequate across regions.", structured)
            parts = [f"{f.mw:.0f} MW from {f.from_city} → {f.to_city}" for f in top]
            return ("Top routing: " + "; ".join(parts) + ".", structured)

        if "ev" in q and ("20" in q or "increase" in q):
            structured = {"note": "Re-run simulation with ev_multiplier ~1.2 for +20% EV load."}
            return (
                "Raising EV usage ~20% typically lifts urban demand ~2–4% depending on temperature. "
                "Use the EV slider at 1.2× and watch coastal + Sun Belt cities first.",
                structured,
            )

        if "supply" in q or "demand" in q:
            td = sum(c.demand_mw for c in cities)
            tr = sum(c.renewable_mw for c in cities)
            structured = {"total_demand_mw": td, "total_renewable_mw": tr}
            return (
                f"Aggregate demand is about {td:,.0f} MW; modeled renewable injection is ~{tr:,.0f} MW. "
                f"Calmest node: {lowest_risk.name}; hottest spot: {most_risk.name}.",
                structured,
            )

        structured = {"summary": "general"}
        return (
            f"Snapshot: {most_risk.name} shows the highest stress ({most_risk.risk_level}). "
            f"{len(flows)} active transfer paths. Adjust sliders to explore scenarios.",
            structured,
        )


state = SimulationState()
