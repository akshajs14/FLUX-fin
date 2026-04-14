import { LiveDeployments } from '@osdk/foundry.models';
import { MODEL_RID, palantirClient } from './palantir';

// ─── Input Schema ─────────────────────────────────────────────────────────────
export interface ZoneInput {
  zone_id: string;
  zone_type: string;
  timestamp: string;       // ISO-8601
  hour_of_day: number;     // 0-23
  day_of_week: number;     // 0 = Monday, 6 = Sunday
  is_weekend: boolean;
  month: number;           // 1-12
  day_of_year: number;     // 1-365
  demand_mw: number;
  temperature_c: number;
  cloud_cover_pct: number; // 0-100
  solar_irradiance_wm2: number;
  wind_speed_ms: number;
  humidity_pct: number;    // 0-100
  population: number;
  demand_lag_1h: number;
  demand_lag_6h: number;
  demand_lag_24h: number;
  demand_rolling_6h_avg: number;
  demand_rolling_24h_avg: number;
}

// ─── Output Schema ────────────────────────────────────────────────────────────
export interface ZonePrediction {
  zone_id?: string;
  predicted_demand_mw?: number;
  confidence_lower?: number;
  confidence_upper?: number;
  risk_score?: number;
  recommended_action?: string;
  /** Derived when API returns hourly (or multi-step) `output_df` per zone */
  forecast_peak_mw?: number;
  forecast_trough_mw?: number;
  forecast_horizon_steps?: number;
  [key: string]: unknown;
}

export interface ModelResult {
  predictions: ZonePrediction[];
  rawResponse: unknown;
}

/** Post-run heuristic: grid under heavy load from per-zone risk scores (0–1). */
export function isHeavyGridLoad(result: ModelResult): boolean {
  const preds = result.predictions;
  if (!preds?.length) return false;
  let maxR = 0;
  let sum = 0;
  let n = 0;
  for (const p of preds) {
    const r = p.risk_score;
    if (typeof r === 'number' && !Number.isNaN(r)) {
      maxR = Math.max(maxR, r);
      sum += r;
      n++;
    }
  }
  if (n === 0) return false;
  if (maxR > 0.52) return true;
  if (sum / n > 0.38) return true;
  return false;
}

/**
 * Heuristic: forecasts disagree materially (risk spread / volatility) — “unstable” Live AI read.
 * Used with `isHeavyGridLoad` for a darker stress visual (e.g. waves).
 */
export function isUnstablePredictionSet(result: ModelResult): boolean {
  const preds = result.predictions;
  if (!preds?.length || preds.length < 2) return false;
  const risks: number[] = [];
  for (const p of preds) {
    const r = p.risk_score;
    if (typeof r === 'number' && !Number.isNaN(r)) risks.push(r);
  }
  if (risks.length < 2) return false;
  const minR = Math.min(...risks);
  const maxR = Math.max(...risks);
  if (maxR - minR > 0.2) return true;
  const mean = risks.reduce((a, b) => a + b, 0) / risks.length;
  if (mean < 1e-6) return false;
  const variance = risks.reduce((a, b) => a + (b - mean) ** 2, 0) / risks.length;
  const cv = Math.sqrt(variance) / mean;
  return cv > 0.35;
}

// ─── Build contextual input for the current moment ───────────────────────────
export function buildTimeContext() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86400000);

  return {
    timestamp: now.toISOString(),
    hour_of_day: now.getHours(),
    day_of_week: now.getDay() === 0 ? 6 : now.getDay() - 1, // Mon=0
    is_weekend: now.getDay() === 0 || now.getDay() === 6,
    month: now.getMonth() + 1,
    day_of_year: dayOfYear,
  };
}

/** Sample interval for zone demand history (must match FluxDashboard tick cadence). */
export const LAG_SAMPLE_INTERVAL_SEC = 2;

/** Max samples kept per zone (~1h at 2s). */
export const ZONE_DEMAND_HISTORY_CAP = Math.floor(3600 / LAG_SAMPLE_INTERVAL_SEC);

/** Samples covering ~1h at 2s cadence (1800). */
function samplesForHours(hours: number): number {
  return Math.floor((hours * 3600) / LAG_SAMPLE_INTERVAL_SEC);
}

/**
 * Lag / rolling features from **this zone’s** demand history (MW), not aggregate grid.
 * Indices are derived from 2s sampling so “1h ago” uses the correct offset.
 */
export function buildDemandLags(currentDemand: number, zoneDemandHistory?: number[]) {
  const hist = zoneDemandHistory ?? [];
  const n = hist.length;
  const s1h = samplesForHours(1);
  const s6h = samplesForHours(6);

  // ~1h ago at 2s cadence; shorter buffer → use ~1 min lookback (30 samples) so stress shows vs recent past.
  let lag1: number;
  if (n >= s1h) {
    lag1 = hist[n - s1h]!;
  } else if (n > 0) {
    const idx = Math.max(0, n - 30);
    lag1 = hist[idx]!;
  } else {
    lag1 = currentDemand * 0.98;
  }

  // ~6h ago: rarely have full buffer; blend oldest available toward current.
  let lag6: number;
  if (n >= s6h) {
    lag6 = hist[n - s6h]!;
  } else if (n > 0) {
    const oldest = hist[0]!;
    lag6 = Math.round(oldest * 0.55 + currentDemand * 0.45);
  } else {
    lag6 = currentDemand * 0.92;
  }

  // 24h lag: soft prior when we don’t have a day of data
  const lag24 =
    n > 0
      ? Math.round(hist[0]! * 0.35 + currentDemand * 0.65)
      : Math.round(currentDemand * 0.88);

  const roll6Slice = n >= s1h ? hist.slice(-s1h) : hist;
  const roll6 =
    roll6Slice.length > 0
      ? roll6Slice.reduce((a, b) => a + b, 0) / roll6Slice.length
      : currentDemand * 0.93;

  const roll24 =
    n > 0 ? hist.reduce((a, b) => a + b, 0) / n : currentDemand * 0.9;

  return {
    demand_lag_1h: Math.round(lag1),
    demand_lag_6h: Math.round(lag6),
    demand_lag_24h: lag24,
    demand_rolling_6h_avg: Math.round(roll6),
    demand_rolling_24h_avg: Math.round(roll24),
  };
}

// ─── Main API call ─────────────────────────────────────────────────────────────
export async function runZonePrediction(zones: ZoneInput[]): Promise<ModelResult> {
  const response = await LiveDeployments.transformJson(
    palantirClient,
    MODEL_RID,
    { input: { input_df: zones } },
    { preview: true }
  );

  const rawUnknown = response as unknown;
  const raw = rawUnknown as Record<string, unknown>;

  // The model may return predictions in various shapes — handle all of them
  let predictions: ZonePrediction[] = [];

  if (Array.isArray(rawUnknown)) {
    predictions = rawUnknown as ZonePrediction[];
  } else if (Array.isArray(raw['output_df'])) {
    predictions = raw['output_df'] as ZonePrediction[];
  } else if (raw['output_df'] && typeof raw['output_df'] === 'object') {
    const od = raw['output_df'] as Record<string, unknown>;
    if (Array.isArray(od['rows'])) predictions = od['rows'] as ZonePrediction[];
  } else if (Array.isArray(raw['output'])) {
    predictions = raw['output'] as ZonePrediction[];
  } else if (raw['predictions'] && Array.isArray(raw['predictions'])) {
    predictions = raw['predictions'] as ZonePrediction[];
  } else if (raw['data'] && Array.isArray(raw['data'])) {
    predictions = raw['data'] as ZonePrediction[];
  } else {
    predictions = [raw as ZonePrediction];
  }

  predictions = collapseModelOutputRows(predictions).map(normalizePredictionRow);

  return { predictions, rawResponse: rawUnknown };
}

/** Pull P10 / P50 / P90 from Foundry-style `quantiles` objects. */
function pickQuantiles(r: Record<string, unknown>): { p10?: number; p50?: number; p90?: number } {
  const q = r['quantiles'];
  if (!q || typeof q !== 'object' || Array.isArray(q)) return {};
  const o = q as Record<string, unknown>;
  const pick = (a: string, b: string): number | undefined => {
    for (const k of [a, b]) {
      const v = o[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return undefined;
  };
  return {
    p10: pick('0.1', '0.10'),
    p50: pick('0.5', '0.50'),
    p90: pick('0.9', '0.90'),
  };
}

/** One API row → prediction + band (output `demand_mw` is the model forecast, not the input feature). */
function deriveSingleRow(row: ZonePrediction): ZonePrediction {
  const r = row as Record<string, unknown>;
  const { p10, p50, p90 } = pickQuantiles(r);

  const num = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    }
    return undefined;
  };

  const predicted =
    num('predicted_demand_mw', 'predictedDemandMw', 'prediction', 'predicted_mw', 'y_hat', 'demand_mw_predicted') ??
    p50 ??
    num('demand_mw', 'output');

  const out: ZonePrediction = {
    zone_id: typeof r['zone_id'] === 'string' ? r['zone_id'] : typeof r['zoneId'] === 'string' ? r['zoneId'] : undefined,
    predicted_demand_mw: predicted,
    confidence_lower: p10 ?? num('confidence_lower'),
    confidence_upper: p90 ?? num('confidence_upper'),
  };

  const peak = num('forecast_peak_mw');
  const trough = num('forecast_trough_mw');
  if (peak !== undefined) out.forecast_peak_mw = peak;
  if (trough !== undefined) out.forecast_trough_mw = trough;

  return out;
}

/**
 * Foundry often returns `output_df` as **many rows per zone** (hourly quantile forecasts).
 * Collapse to one summary per zone with a headline prediction + horizon peak/trough + uncertainty band.
 */
function collapseModelOutputRows(rows: ZonePrediction[]): ZonePrediction[] {
  if (rows.length === 0) return [];

  const byZone = new Map<string, ZonePrediction[]>();
  for (const row of rows) {
    const id = (row as Record<string, unknown>)['zone_id'];
    if (typeof id !== 'string') continue;
    if (!byZone.has(id)) byZone.set(id, []);
    byZone.get(id)!.push(row);
  }

  if (byZone.size === 0) {
    return rows.map(r => deriveSingleRow(r));
  }

  const collapsed: ZonePrediction[] = [];
  for (const [zoneId, series] of byZone) {
    if (series.length === 1) {
      collapsed.push(deriveSingleRow(series[0]!));
      continue;
    }

    const sorted = [...series].sort((a, b) => {
      const ta = String((a as Record<string, unknown>)['timestamp'] ?? '');
      const tb = String((b as Record<string, unknown>)['timestamp'] ?? '');
      return ta.localeCompare(tb);
    });

    const latest = sorted[sorted.length - 1]!;
    const lr = latest as Record<string, unknown>;
    const { p10, p50, p90 } = pickQuantiles(lr);

    const demands = sorted
      .map(x => (x as Record<string, unknown>)['demand_mw'])
      .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

    const peak = demands.length ? Math.max(...demands) : undefined;
    const trough = demands.length ? Math.min(...demands) : undefined;
    const predicted =
      p50 ??
      (typeof lr['demand_mw'] === 'number' ? lr['demand_mw'] : undefined) ??
      (peak !== undefined && trough !== undefined ? (peak + trough) / 2 : peak);

    let risk: number | undefined;
    if (peak !== undefined && peak > 0 && trough !== undefined) {
      risk = Math.min(1, (peak - trough) / peak);
    }

    collapsed.push({
      zone_id: zoneId,
      predicted_demand_mw: predicted,
      confidence_lower: p10 ?? (sorted[0] ? pickQuantiles(sorted[0] as Record<string, unknown>).p10 : undefined),
      confidence_upper: p90,
      risk_score: risk,
      forecast_peak_mw: peak,
      forecast_trough_mw: trough,
      forecast_horizon_steps: sorted.length,
    });
  }

  return collapsed;
}

/** Map API row objects onto ZonePrediction + common alternate field names. */
function normalizePredictionRow(row: ZonePrediction): ZonePrediction {
  const r = row as Record<string, unknown>;
  const num = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    }
    return undefined;
  };

  const predicted =
    num('predicted_demand_mw', 'predictedDemandMw', 'prediction', 'predicted_mw', 'output', 'y_hat', 'demand_mw_predicted') ??
    pickQuantiles(r).p50 ??
    num('demand_mw');

  const risk = num('risk_score', 'riskScore', 'risk');

  const out: ZonePrediction = { ...row };
  if (predicted !== undefined) out.predicted_demand_mw = predicted;
  if (risk !== undefined) out.risk_score = risk <= 1 ? risk : risk / 100;

  const z = r['zone_id'] ?? r['zoneId'] ?? r['id'];
  if (typeof z === 'string') out.zone_id = z;

  // Strip huge nested blobs from normalized row (UI uses derived fields only)
  delete (out as Record<string, unknown>)['quantiles'];
  delete (out as Record<string, unknown>)['output_df'];

  return out;
}

/** Resolve prediction for a zone (match zone_id when present). */
export function predictionForZone(predictions: ZonePrediction[], zoneId: string, index: number): ZonePrediction {
  const byId = predictions.find(p => p.zone_id === zoneId);
  if (byId) return byId;
  return predictions[index] ?? {};
}

/** Safe display for extra prediction fields (avoid [object Object]). */
export function formatPredictionExtra(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
