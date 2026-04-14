/**
 * Local prediction engine — replaces the Palantir Foundry ML model.
 * Produces realistic demand forecasts, risk scores, and confidence bands
 * using physics-inspired heuristics (no external API needed).
 */

import type { ZoneInput, ZonePrediction, ModelResult } from './modelApi';

// ─── Seeded random for reproducibility within a run ─────────────────────────
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Zone-type multipliers ──────────────────────────────────────────────────
const ZONE_DEMAND_PROFILES: Record<string, { tempSensitivity: number; peakHourBoost: number; weekendFactor: number }> = {
  residential:  { tempSensitivity: 1.3, peakHourBoost: 1.25, weekendFactor: 1.1 },
  commercial:   { tempSensitivity: 1.1, peakHourBoost: 1.35, weekendFactor: 0.7 },
  industrial:   { tempSensitivity: 0.8, peakHourBoost: 1.1,  weekendFactor: 0.6 },
  solar:        { tempSensitivity: 0.2, peakHourBoost: 0.5,  weekendFactor: 1.0 },
  wind:         { tempSensitivity: 0.1, peakHourBoost: 0.3,  weekendFactor: 1.0 },
};

function getProfile(zoneType: string) {
  return ZONE_DEMAND_PROFILES[zoneType] ?? ZONE_DEMAND_PROFILES['commercial']!;
}

// ─── Temperature → demand curve (U-shaped: high heating + high cooling) ─────
function temperatureFactor(tempC: number): number {
  // Comfort zone ~20°C; demand rises on either side
  const comfort = 20;
  const diff = Math.abs(tempC - comfort);
  return 1 + diff * 0.012 + (diff > 15 ? (diff - 15) * 0.008 : 0);
}

// ─── Solar generation estimate ──────────────────────────────────────────────
function solarGeneration(irradiance: number, cloudPct: number): number {
  const clearSky = irradiance * (1 - cloudPct / 130); // clouds reduce but not fully
  return Math.max(0, clearSky * 0.18); // ~18% panel efficiency factor → MW-scale
}

// ─── Hour-of-day demand shape (diurnal curve) ───────────────────────────────
function hourFactor(hour: number): number {
  // Morning ramp 6-9, plateau 9-17, evening peak 17-20, night trough 0-5
  if (hour < 5) return 0.6;
  if (hour < 9) return 0.6 + (hour - 5) * 0.1;
  if (hour < 17) return 1.0;
  if (hour < 20) return 1.0 + (hour - 17) * 0.05; // evening peak
  return 1.15 - (hour - 20) * 0.12;
}

// ─── Main local prediction ──────────────────────────────────────────────────
function predictZone(zone: ZoneInput, rng: () => number): ZonePrediction {
  const profile = getProfile(zone.zone_type);

  // Base demand adjusted by conditions
  const tempF = temperatureFactor(zone.temperature_c) * profile.tempSensitivity;
  const hourF = hourFactor(zone.hour_of_day) * profile.peakHourBoost;
  const weekendF = zone.is_weekend ? profile.weekendFactor : 1.0;
  const humidityF = 1 + (zone.humidity_pct - 50) * 0.001; // slight humidity effect

  // Renewable zones: generation instead of demand
  if (zone.zone_type === 'solar') {
    const gen = solarGeneration(zone.solar_irradiance_wm2, zone.cloud_cover_pct);
    const noise = 1 + (rng() - 0.5) * 0.08;
    const predicted = Math.round(gen * noise * 10) / 10;
    const band = predicted * 0.15;
    return {
      zone_id: zone.zone_id,
      predicted_demand_mw: predicted,
      confidence_lower: Math.round((predicted - band) * 10) / 10,
      confidence_upper: Math.round((predicted + band) * 10) / 10,
      risk_score: Math.min(1, Math.max(0, 0.1 + (zone.cloud_cover_pct / 100) * 0.4 + rng() * 0.1)),
      recommended_action: zone.cloud_cover_pct > 60
        ? 'High cloud cover — activate battery reserves'
        : 'Solar output nominal',
    };
  }

  if (zone.zone_type === 'wind') {
    const windGen = zone.wind_speed_ms * 12 * (1 + (rng() - 0.5) * 0.15);
    const predicted = Math.round(Math.max(0, windGen) * 10) / 10;
    const band = predicted * 0.2;
    return {
      zone_id: zone.zone_id,
      predicted_demand_mw: predicted,
      confidence_lower: Math.round((predicted - band) * 10) / 10,
      confidence_upper: Math.round((predicted + band) * 10) / 10,
      risk_score: Math.min(1, Math.max(0, zone.wind_speed_ms < 3 ? 0.6 : 0.15 + rng() * 0.15)),
      recommended_action: zone.wind_speed_ms < 3
        ? 'Low wind — supplement with grid power'
        : 'Wind generation within normal range',
    };
  }

  // Demand zones (residential, commercial, industrial)
  const basePredicted = zone.demand_mw * tempF * hourF * weekendF * humidityF;

  // Incorporate lag trends: if demand is rising, predict higher
  const lagTrend = zone.demand_lag_1h > 0
    ? (zone.demand_mw - zone.demand_lag_1h) / zone.demand_lag_1h
    : 0;
  const trendAdj = 1 + lagTrend * 0.3;

  const noise = 1 + (rng() - 0.5) * 0.06;
  const predicted = Math.round(basePredicted * trendAdj * noise * 10) / 10;

  // Confidence band widens with higher demand & uncertainty
  const bandPct = 0.08 + Math.abs(lagTrend) * 0.1 + (zone.humidity_pct / 100) * 0.04;
  const lower = Math.round(predicted * (1 - bandPct) * 10) / 10;
  const upper = Math.round(predicted * (1 + bandPct) * 10) / 10;

  // Risk: higher when demand outpaces recent history, extreme temps, high humidity
  const demandRatio = zone.demand_lag_24h > 0 ? predicted / zone.demand_lag_24h : 1;
  const tempRisk = Math.abs(zone.temperature_c - 20) > 15 ? 0.2 : 0;
  const rawRisk = (demandRatio - 0.8) * 0.6 + tempRisk + lagTrend * 0.3 + rng() * 0.08;
  const risk = Math.round(Math.min(1, Math.max(0, rawRisk)) * 100) / 100;

  // Recommendation based on risk
  let action: string;
  if (risk > 0.7) action = 'Critical — activate demand response and shed non-essential load';
  else if (risk > 0.5) action = 'Elevated load — pre-stage backup generation';
  else if (risk > 0.3) action = 'Moderate — monitor closely and prepare reserves';
  else action = 'Grid stable — nominal operations';

  return {
    zone_id: zone.zone_id,
    predicted_demand_mw: predicted,
    confidence_lower: lower,
    confidence_upper: upper,
    risk_score: risk,
    recommended_action: action,
  };
}

// ─── Public API (drop-in replacement for runZonePrediction) ─────────────────
export async function runLocalPrediction(zones: ZoneInput[]): Promise<ModelResult> {
  // Tiny delay to feel like a real API call
  await new Promise(r => setTimeout(r, 300 + Math.random() * 400));

  const seed = Date.now() ^ zones.length;
  const rng = mulberry32(seed);

  const predictions = zones.map(z => predictZone(z, rng));

  return { predictions, rawResponse: { source: 'local-model', timestamp: new Date().toISOString() } };
}
