import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../lib/palantir';
import { GlowFrame } from './GlowFrame';
import {
  buildDemandLags,
  buildTimeContext,
  isHeavyGridLoad,
  isUnstablePredictionSet,
  predictionForZone,
  runZonePrediction,
  ZONE_DEMAND_HISTORY_CAP,
  type ModelResult,
  type ZoneInput,
  type ZonePrediction,
} from '../lib/modelApi';
import { Waves } from './Waves';

// ─── Zone definitions ─────────────────────────────────────────────────────────
interface Zone {
  id: string;
  label: string;
  type: string;
  baseDemand: number;
  population: number;
  color: string;
  icon: string;
}

const ZONES: Zone[] = [
  { id: 'res-north',   label: 'Residential North', type: 'residential', baseDemand: 620,  population: 185_000, color: '#7dd3fc', icon: '🏘' },
  { id: 'com-core',    label: 'Commercial Core',   type: 'commercial',  baseDemand: 840,  population: 52_000,  color: '#d4942e', icon: '🏢' },
  { id: 'ind-south',   label: 'Industrial South',  type: 'industrial',  baseDemand: 480,  population: 14_000,  color: '#f97316', icon: '🏭' },
  { id: 'solar-east',  label: 'Solar Farm East',   type: 'solar',       baseDemand: 0,    population: 0,       color: '#eab308', icon: '☀' },
  { id: 'wind-west',   label: 'Wind Array West',   type: 'wind',        baseDemand: 0,    population: 0,       color: '#a78bfa', icon: '💨' },
  { id: 'data-center', label: 'Data Center',       type: 'commercial',  baseDemand: 310,  population: 8_000,   color: '#34d399', icon: '🖥' },
];

type StressType = 'none' | 'surge' | 'outage' | 'fluctuation';

interface ZoneState {
  stressType: StressType;
  stressIntensity: number; // 0-100%
  isSelected: boolean;
}

interface SimState {
  temperature_c: number;
  cloud_cover_pct: number;
  wind_speed_ms: number;
  humidity_pct: number;
  solar_irradiance_wm2: number;
}

interface SimulationSectionProps {
  /** @deprecated Aggregate grid history is not used for per-zone lags (wrong scale). Kept for API compatibility. */
  demandHistory?: number[];
  /** Live total grid demand for “delta vs live” display only */
  currentTotalDemand?: number;
}

function stressLabel(t: StressType): string {
  return t === 'surge' ? 'SURGE' : t === 'outage' ? 'OUTAGE' : t === 'fluctuation' ? 'FLUCTUATING' : 'NORMAL';
}

function stressColor(t: StressType): string {
  return t === 'surge' ? 'var(--orange)' : t === 'outage' ? 'var(--red)' : t === 'fluctuation' ? '#a78bfa' : 'var(--green)';
}

function computeZoneDemand(zone: Zone, zoneState: ZoneState, env: SimState): number {
  let demand = zone.baseDemand;
  // Adjust for temperature (higher temp → more AC load for residential/commercial)
  const tempFactor = zone.type === 'residential' || zone.type === 'commercial'
    ? 1 + (env.temperature_c - 22) * 0.012
    : 1;
  demand *= Math.max(0.5, tempFactor);

  // Apply stress
  if (zoneState.stressType === 'surge') {
    demand *= 1 + (zoneState.stressIntensity / 100) * 1.5;
  } else if (zoneState.stressType === 'outage') {
    demand *= 1 - (zoneState.stressIntensity / 100) * 0.95;
  } else if (zoneState.stressType === 'fluctuation') {
    const noise = (Math.random() - 0.5) * (zoneState.stressIntensity / 100) * 0.6;
    demand *= 1 + noise;
  }

  // Solar farms: reduce output when cloudy
  if (zone.type === 'solar') {
    demand = (env.solar_irradiance_wm2 / 1000) * 1200 * (1 - env.cloud_cover_pct / 100);
    if (zoneState.stressType === 'outage') demand *= 0.1;
    if (zoneState.stressType === 'fluctuation') demand *= 0.5 + Math.random() * 0.5;
  }

  // Wind farms: scale with wind speed
  if (zone.type === 'wind') {
    demand = Math.min(env.wind_speed_ms * 55, 950);
    if (zoneState.stressType === 'outage') demand *= 0.1;
  }

  return Math.max(0, Math.round(demand));
}

interface StressedZoneContext {
  zoneId: string;
  label: string;
  stressType: StressType;
  intensity: number;
}

function deriveRecommendations(
  predictions: ZonePrediction[],
  zones: ZoneInput[],
  stressedZones: StressedZoneContext[],
): string[] {
  const scenarioRecs: string[] = [];
  const modelRecs: string[] = [];

  if (stressedZones.length > 0) {
    const maxInt = Math.max(...stressedZones.map(z => z.intensity));
    const kinds = [...new Set(stressedZones.map(z => stressLabel(z.stressType)))];
    scenarioRecs.push(
      `🔥 Simulation scenario: ${stressedZones.length} stressed zone(s) (${kinds.join(', ')}) · peak intensity ${maxInt}% — model inputs include this disturbance, not steady-state operations.`,
    );
    for (const s of stressedZones) {
      if (s.stressType === 'surge') {
        scenarioRecs.push(
          `⚡ ${s.label}: surge stress at ${s.intensity}% — expect materially higher draw; stage reserves, watch tie-lines, and prep demand response.`,
        );
      } else if (s.stressType === 'outage') {
        scenarioRecs.push(
          `⬛ ${s.label}: outage stress at ${s.intensity}% — contingency footing; load shed tiers, voltage stability, and black-start paths.`,
        );
      } else if (s.stressType === 'fluctuation') {
        scenarioRecs.push(
          `〰 ${s.label}: fluctuation stress at ${s.intensity}% — hold regulating margin and frequency response; avoid aggressive merit-order shifts.`,
        );
      }
    }
  }

  let sumPred = 0;
  let sumCur = 0;
  let predCount = 0;

  zones.forEach((zone, i) => {
    const p = predictionForZone(predictions, zone.zone_id, i);
    sumCur += zone.demand_mw;
    const pr = p.predicted_demand_mw;
    if (pr === undefined) return;

    sumPred += pr;
    predCount++;

    const delta = pr - zone.demand_mw;
    if (delta > zone.demand_mw * 0.2) {
      modelRecs.push(`📈 ${zone.zone_id}: Forecast vs input +${Math.round(delta)} MW — pre-charge storage / import capacity`);
    } else if (pr < zone.demand_mw * 0.3) {
      modelRecs.push(`📉 ${zone.zone_id}: Forecast well below input — verify shedding and reroute ~${Math.round(zone.demand_mw - pr)} MW`);
    }
    if (p.risk_score !== undefined && p.risk_score > 0.7) {
      modelRecs.push(`🔴 ${zone.zone_id}: Elevated uncertainty (${(p.risk_score * 100).toFixed(0)}%) — peaker / spinning reserve`);
    }
  });

  if (predCount === zones.length) {
    const systemDelta = sumPred - sumCur;
    if (systemDelta > 300) {
      modelRecs.push(`📈 Net forecast uplift ~+${Math.round(systemDelta)} MW vs scenario inputs — system-wide demand response may be needed`);
    } else if (sumPred < sumCur * 0.8) {
      modelRecs.push(`🔋 Net forecast below inputs — surplus headroom ~${Math.round((sumCur - sumPred) * 0.8)} MW (charging / export)`);
    }
  }

  const recs = [...scenarioRecs, ...modelRecs];

  if (stressedZones.length > 0 && modelRecs.length === 0) {
    recs.push(
      '📡 Forecast metrics from the deployment were not available (e.g. predicted n/a). The lines above still reflect your applied stress scenario — do not treat this run as “normal operations.”',
    );
  }

  if (stressedZones.length === 0 && recs.length === 0) {
    recs.push('✅ Grid operating within normal parameters — no immediate actions required');
    recs.push('📊 Optimal dispatch maintained across all generation assets');
  }

  return recs;
}

export function SimulationSection({ currentTotalDemand }: SimulationSectionProps) {
  const [zoneStates, setZoneStates] = useState<Record<string, ZoneState>>(
    Object.fromEntries(ZONES.map(z => [z.id, { stressType: 'none', stressIntensity: 60, isSelected: false }]))
  );
  const [activeStressType, setActiveStressType] = useState<StressType>('surge');
  const [env, setEnv] = useState<SimState>({
    temperature_c: 28,
    cloud_cover_pct: 20,
    wind_speed_ms: 8,
    humidity_pct: 55,
    solar_irradiance_wm2: 750,
  });
  const [stressIntensity, setStressIntensity] = useState(65);
  const [loading, setLoading] = useState(false);
  const [authState, setAuthState] = useState<'idle' | 'authenticating' | 'error'>('idle');
  const [modelResult, setModelResult] = useState<ModelResult | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);
  /** Per-zone MW history (2s cadence) — lags must use this, not aggregate grid demand. */
  const zoneDemandHistoryRef = useRef<Record<string, number[]>>({});

  const setEnvVal = (key: keyof SimState, val: number) =>
    setEnv(prev => ({ ...prev, [key]: val }));

  const toggleZoneStress = useCallback((zoneId: string) => {
    setZoneStates(prev => {
      const current = prev[zoneId];
      const isActive = current.stressType === activeStressType;
      return {
        ...prev,
        [zoneId]: {
          ...current,
          stressType: isActive ? 'none' : activeStressType,
          stressIntensity: stressIntensity,
        },
      };
    });
  }, [activeStressType, stressIntensity]);

  const applyStressToAll = useCallback(() => {
    setZoneStates(prev =>
      Object.fromEntries(
        Object.entries(prev).map(([id, s]) => [id, { ...s, stressType: activeStressType, stressIntensity: stressIntensity }])
      )
    );
  }, [activeStressType, stressIntensity]);

  const clearAllStress = useCallback(() => {
    setZoneStates(prev =>
      Object.fromEntries(Object.entries(prev).map(([id, s]) => [id, { ...s, stressType: 'none' }]))
    );
    setModelResult(null);
    setModelError(null);
    setRecommendations([]);
  }, []);

  const appendZoneHistories = useCallback(() => {
    for (const zone of ZONES) {
      const zs = zoneStates[zone.id];
      const demand = computeZoneDemand(zone, zs, env);
      const prev = zoneDemandHistoryRef.current[zone.id] ?? [];
      zoneDemandHistoryRef.current[zone.id] = [...prev, demand].slice(-ZONE_DEMAND_HISTORY_CAP);
    }
  }, [zoneStates, env]);

  useEffect(() => {
    appendZoneHistories();
    const id = setInterval(appendZoneHistories, 2000);
    return () => clearInterval(id);
  }, [appendZoneHistories]);

  const buildInputs = useCallback((): ZoneInput[] => {
    const timeCtx = buildTimeContext();
    return ZONES.map(zone => {
      const zs = zoneStates[zone.id];
      const demand = computeZoneDemand(zone, zs, env);
      const zoneHist = zoneDemandHistoryRef.current[zone.id] ?? [];
      const lags = buildDemandLags(demand, zoneHist);
      return {
        zone_id: zone.id,
        zone_type: zone.type,
        ...timeCtx,
        demand_mw: demand,
        temperature_c: env.temperature_c,
        cloud_cover_pct: env.cloud_cover_pct,
        solar_irradiance_wm2: env.solar_irradiance_wm2,
        wind_speed_ms: env.wind_speed_ms,
        humidity_pct: env.humidity_pct,
        population: zone.population,
        ...lags,
      };
    });
  }, [zoneStates, env]);

  const handleRunModel = useCallback(async () => {
    setLoading(true);
    setModelError(null);
    setModelResult(null);
    setRecommendations([]);

    const inputs = buildInputs();
    const stressedZones: StressedZoneContext[] = ZONES.filter(z => zoneStates[z.id].stressType !== 'none').map(z => ({
      zoneId: z.id,
      label: z.label,
      stressType: zoneStates[z.id].stressType,
      intensity: zoneStates[z.id].stressIntensity,
    }));
    try {
      const result = await runZonePrediction(inputs);
      setModelResult(result);
      setRecommendations(deriveRecommendations(result.predictions, inputs, stressedZones));
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('401') || msg.toLowerCase().includes('403')) {
        setAuthState('error');
        setModelError('Authentication required. Click "Connect to Foundry" to authenticate with Palantir.');
      } else {
        setModelError(`Model error: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [buildInputs]);

  const handleConnect = useCallback(async () => {
    setAuthState('authenticating');
    // signIn() redirects the browser to Foundry login.
    // The AuthCallback page handles the return and token exchange,
    // then redirects back here. No catch needed — navigation leaves the page.
    await auth.signIn();
  }, []);

  const stressedZones = ZONES.filter(z => zoneStates[z.id].stressType !== 'none');
  const totalCurrentDemand = ZONES.reduce((sum, z) => sum + computeZoneDemand(z, zoneStates[z.id], env), 0);

  const twinAiLines = useMemo(() => {
    if (recommendations.length > 0) return recommendations.slice(0, 8);
    if (stressedZones.length === 0) {
      return [
        'Flux AI: idle — no zone stress applied',
        'Twin reflects nominal inputs; run prediction to pull Foundry forecasts',
      ];
    }
    return stressedZones.map(z => {
      const st = zoneStates[z.id].stressType;
      const int = zoneStates[z.id].stressIntensity;
      const lab = stressLabel(st);
      if (st === 'surge') {
        return `AI staging margin for ${z.label} (${lab} ${int}%) — demand response armed`;
      }
      if (st === 'outage') {
        return `AI isolating ${z.label} (${lab} ${int}%) — contingency & shed tiers`;
      }
      return `AI smoothing ${z.label} (${lab} ${int}%) — regulating band held`;
    });
  }, [recommendations, stressedZones, zoneStates]);

  /**
   * Wave palette: Foundry risk when available; otherwise reflect **scenario stress** (zones you turned up).
   * Previously we only looked at `modelResult`, so with no run or no `risk_score` in the payload the grid
   * stayed “ok” green even at 100% surge — that mismatch is fixed here.
   */
  const wavesColors = useMemo(() => {
    const bg = '#000000';
    if (loading) {
      return {
        lineColor: '#facc15',
        backgroundColor: bg,
        lineOpacity: 0.72,
      };
    }

    const apiHeavy = modelResult != null && isHeavyGridLoad(modelResult);
    const apiUnstable = modelResult != null && isUnstablePredictionSet(modelResult);
    if (apiHeavy) {
      if (apiUnstable) {
        return {
          lineColor: '#5c1010',
          backgroundColor: bg,
          lineOpacity: 0.78,
        };
      }
      return {
        lineColor: '#f87171',
        backgroundColor: bg,
        lineOpacity: 0.68,
      };
    }

    const stressed = ZONES.filter(z => zoneStates[z.id].stressType !== 'none');
    const maxScenarioI =
      stressed.length === 0 ? 0 : Math.max(...stressed.map(z => zoneStates[z.id].stressIntensity));
    const scenarioStressed = stressed.length > 0;
    if (scenarioStressed) {
      const deep = maxScenarioI >= 72 || stressed.length >= 5;
      return {
        lineColor: deep ? '#f97316' : '#fbbf24',
        backgroundColor: bg,
        lineOpacity: deep ? 0.7 : 0.64,
      };
    }

    if (!modelResult) {
      return {
        lineColor: '#34d399',
        backgroundColor: bg,
        lineOpacity: 0.58,
      };
    }
    return {
      lineColor: '#4ade80',
      backgroundColor: bg,
      lineOpacity: 0.58,
    };
  }, [loading, modelResult, zoneStates]);

  return (
    <section id="s-simulation" className="section sim-section">
      <Waves
        fullscreen
        lineColor={wavesColors.lineColor}
        backgroundColor={wavesColors.backgroundColor}
        lineOpacity={wavesColors.lineOpacity}
        waveSpeedX={0.0125}
        waveSpeedY={0.01}
        waveAmpX={40}
        waveAmpY={20}
        friction={0.9}
        tension={0.01}
        maxCursorMove={120}
        xGap={12}
        yGap={36}
      />
      <div className="sim-section-foreground">
      {/* Header */}
      <div className="sec-header">
        <div className="sec-label">Scenario Simulation</div>
        <div className="sec-title">Live Model Integration</div>
        <div className="sec-sub">Palantir Foundry ML · {MODEL_DISPLAY_RID}</div>
        <div className="sec-desc">
          Inject real-world stress scenarios — power surges, outages, renewable fluctuations —
          and send live zone state to the Palantir Foundry ML deployment. The model returns
          per-zone demand predictions which drive AI response recommendations.
        </div>
      </div>

      <div className="sim-layout">
      <div className="sim-layout__left">
      {/* ── Stress Controls Bar ── */}
      <GlowFrame className="border-glow--w100 border-glow--flex">
        <div className="sim-controls-bar glow-strip">
          <div className="sim-controls-left">
            <div className="sim-mode-group">
              <span className="sim-ctrl-label">Stress Mode</span>
              <div className="sim-pills">
                {(['surge', 'outage', 'fluctuation'] as StressType[]).map(t => (
                  <GlowFrame key={t} borderRadius={5} glowRadius={24} glowIntensity={0.65} className="border-glow--inline-flex">
                    <button
                      type="button"
                      data-stress={t}
                      className={`sim-pill glow-strip ${activeStressType === t ? 'active' : ''}`}
                      onClick={() => setActiveStressType(t)}
                    >
                      {t === 'surge' ? '⚡' : t === 'outage' ? '⬛' : '〰'} {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  </GlowFrame>
                ))}
              </div>
            </div>
            <div className="sim-mode-group">
              <span className="sim-ctrl-label">Intensity {stressIntensity}%</span>
              <input
                type="range" min={5} max={100} value={stressIntensity}
                onChange={e => setStressIntensity(Number(e.target.value))}
                className="sim-slider"
              />
            </div>
          </div>
          <div className="sim-controls-right">
            <GlowFrame borderRadius={5} glowRadius={24} glowIntensity={0.65} className="border-glow--inline-flex">
              <button type="button" className="sim-btn-sm glow-strip" onClick={applyStressToAll}>Apply All</button>
            </GlowFrame>
            <GlowFrame borderRadius={5} glowRadius={24} glowIntensity={0.65} className="border-glow--inline-flex">
              <button type="button" className="sim-btn-sm danger glow-strip" onClick={clearAllStress}>Clear</button>
            </GlowFrame>
          </div>
        </div>
      </GlowFrame>

      {/* ── Zone Grid ── */}
      <div className="sim-zone-grid">
        {ZONES.map(zone => {
          const zs = zoneStates[zone.id];
          const demand = computeZoneDemand(zone, zs, env);
          const isStressed = zs.stressType !== 'none';
          return (
            <GlowFrame
              key={zone.id}
              borderRadius={9}
              glowRadius={32}
              glowIntensity={0.72}
              className="border-glow--w100 border-glow--flex"
            >
              <div
                className={`sim-zone-card glow-strip ${isStressed ? 'stressed' : ''}`}
                style={isStressed ? { borderColor: stressColor(zs.stressType) } : {}}
                onClick={() => toggleZoneStress(zone.id)}
                title={`Click to ${isStressed ? 'remove' : 'apply'} ${activeStressType} stress`}
              >
                <div className="sim-zone-top">
                  <span className="sim-zone-icon">{zone.icon}</span>
                  <span className="sim-zone-badge" style={{ color: stressColor(zs.stressType), borderColor: stressColor(zs.stressType) }}>
                    {stressLabel(zs.stressType)}
                  </span>
                </div>
                <div className="sim-zone-name">{zone.label}</div>
                <div className="sim-zone-demand">{demand.toLocaleString()} <span>MW</span></div>
                <div className="sim-zone-type">{zone.type}</div>
                {isStressed && (
                  <div className="sim-zone-stress-bar">
                    <div className="sim-zone-stress-fill" style={{ width: zs.stressIntensity + '%', background: stressColor(zs.stressType) }} />
                  </div>
                )}
              </div>
            </GlowFrame>
          );
        })}
      </div>
      </div>

      <div className="sim-layout__right">
      {/* ── Environmental Parameters ── */}
      <GlowFrame className="border-glow--w100 border-glow--flex">
        <details className="sim-env-panel c glow-strip">
          <summary className="c-h sim-env-summary">
            <div className="c-t">Environmental Parameters</div>
            <div className="sim-env-vals">
              <span>{env.temperature_c}°C</span>
              <span>{env.cloud_cover_pct}% cloud</span>
              <span>{env.wind_speed_ms} m/s</span>
              <span>{env.solar_irradiance_wm2} W/m²</span>
            </div>
          </summary>
          <div className="sim-env-grid c-b">
          {[
            { key: 'temperature_c' as const, label: 'Temperature (°C)', min: -10, max: 45, step: 1, unit: '°C' },
            { key: 'cloud_cover_pct' as const, label: 'Cloud Cover', min: 0, max: 100, step: 5, unit: '%' },
            { key: 'wind_speed_ms' as const, label: 'Wind Speed', min: 0, max: 25, step: 0.5, unit: 'm/s' },
            { key: 'humidity_pct' as const, label: 'Humidity', min: 0, max: 100, step: 5, unit: '%' },
            { key: 'solar_irradiance_wm2' as const, label: 'Solar Irradiance', min: 0, max: 1200, step: 50, unit: 'W/m²' },
          ].map(p => (
            <label key={p.key} className="sim-env-row">
              <div className="sim-env-label-row">
                <span className="sim-ctrl-label">{p.label}</span>
                <span className="sim-env-val">{env[p.key]}{p.unit}</span>
              </div>
              <input
                type="range" min={p.min} max={p.max} step={p.step} value={env[p.key]}
                onChange={e => setEnvVal(p.key, Number(e.target.value))}
                className="sim-slider"
              />
            </label>
          ))}
        </div>
        </details>
      </GlowFrame>

      {/* ── Run Model Panel ── */}
      <GlowFrame className="border-glow--w100 border-glow--flex">
        <div className="sim-run-panel glow-strip">
        <div className="sim-run-summary">
          <div className="sim-run-stat">
            <span className="sim-run-stat-v">{stressedZones.length}</span>
            <span className="sim-run-stat-l">Zones stressed</span>
          </div>
          <div className="sim-run-stat">
            <span className="sim-run-stat-v">{totalCurrentDemand.toLocaleString()}</span>
            <span className="sim-run-stat-l">Simulated MW</span>
          </div>
          <div className="sim-run-stat">
            <span className="sim-run-stat-v">{currentTotalDemand ? Math.abs(totalCurrentDemand - currentTotalDemand).toFixed(0) : '—'}</span>
            <span className="sim-run-stat-l">Delta vs live (MW)</span>
          </div>
          <div className="sim-run-stat">
            <span className="sim-run-stat-v">{ZONES.length}</span>
            <span className="sim-run-stat-l">Input zones</span>
          </div>
        </div>

        {authState === 'error' ? (
          <button className="sim-run-btn auth" onClick={handleConnect} type="button">
            🔐 Connect to Palantir Foundry
          </button>
        ) : (
          <button
            className="sim-run-btn"
            onClick={handleRunModel}
            disabled={loading}
          >
            {loading
              ? <span className="sim-run-loading"><span className="sim-spinner" />Running Model...</span>
              : '▶ Run Flux Prediction'}
          </button>
        )}
        </div>
      </GlowFrame>

      {/* ── Model Error ── */}
      {modelError && (
        <GlowFrame borderRadius={8} backgroundColor="oklch(0.64 0.20 22 / 0.07)" glowRadius={32} glowIntensity={0.75} className="border-glow--w100">
          <div className="sim-error glow-strip">
            <strong>⚠ Model Error</strong>
            <p>{modelError}</p>
          </div>
        </GlowFrame>
      )}

      {/* ── Results ── */}
      {modelResult && (
        <GlowFrame className="border-glow--w100 border-glow--flex">
          <div className="sim-results glow-strip" ref={resultRef}>
          <div className="sim-results-header">
            <div className="c-t">Model Response <span style={{ color: 'var(--green)', marginLeft: 8 }}>● Live</span></div>
            <div className="sim-results-meta">
              Foundry ML · {new Date().toLocaleTimeString('en-US', { hour12: false })}
            </div>
          </div>

          {/* Per-zone predictions */}
          <div className="sim-pred-grid">
            {ZONES.map((zone, i) => {
              const pred: ZonePrediction = predictionForZone(modelResult.predictions, zone.id, i);
              const predictedMW = pred.predicted_demand_mw ?? null;
              const inputs = buildInputs();
              const currentMW = inputs[i]?.demand_mw ?? 0;
              const delta = predictedMW !== null ? predictedMW - currentMW : null;
              const risk = pred.risk_score !== undefined ? pred.risk_score * 100 : null;

              return (
                <div key={zone.id} className="sim-pred-card">
                  <div className="sim-pred-zone">
                    <span style={{ color: zone.color }}>{zone.icon}</span> {zone.label}
                  </div>
                  <div className="sim-pred-row">
                    <span className="sim-pred-lbl">Input</span>
                    <span className="sim-pred-val">{currentMW.toLocaleString()} MW</span>
                  </div>
                  {predictedMW !== null ? (
                    <>
                      <div className="sim-pred-row">
                        <span className="sim-pred-lbl">Predicted</span>
                        <span className="sim-pred-val accent">{Math.round(predictedMW).toLocaleString()} MW</span>
                      </div>
                      {delta !== null && (
                        <div className="sim-pred-row">
                          <span className="sim-pred-lbl">Delta</span>
                          <span className="sim-pred-val" style={{ color: delta > 0 ? 'var(--orange)' : 'var(--green)' }}>
                            {delta > 0 ? '+' : ''}{Math.round(delta)} MW
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="sim-pred-row">
                      <span className="sim-pred-lbl">Predicted</span>
                      <span className="sim-pred-val" style={{ color: 'var(--text3)' }}>n/a</span>
                    </div>
                  )}
                  {risk !== null && (
                    <div className="sim-pred-risk">
                      <div className="sim-pred-risk-bar">
                        <div className="sim-pred-risk-fill"
                          style={{ width: `${risk}%`, background: risk > 70 ? 'var(--red)' : risk > 40 ? 'var(--orange)' : 'var(--green)' }} />
                      </div>
                      <span style={{ color: risk > 70 ? 'var(--red)' : risk > 40 ? 'var(--orange)' : 'var(--green)' }}>
                        {risk.toFixed(0)}% volatility
                      </span>
                    </div>
                  )}
                  {pred.confidence_lower != null && pred.confidence_upper != null && (
                    <div className="sim-pred-row">
                      <span className="sim-pred-lbl">P10–P90 band</span>
                      <span className="sim-pred-val" style={{ fontSize: 11 }}>
                        {Math.round(pred.confidence_lower).toLocaleString()} – {Math.round(pred.confidence_upper).toLocaleString()} MW
                      </span>
                    </div>
                  )}
                  {typeof pred.forecast_peak_mw === 'number' && typeof pred.forecast_trough_mw === 'number' && (
                    <div className="sim-pred-row">
                      <span className="sim-pred-lbl">Forecast range</span>
                      <span className="sim-pred-val" style={{ fontSize: 11 }}>
                        {Math.round(pred.forecast_trough_mw).toLocaleString()} – {Math.round(pred.forecast_peak_mw).toLocaleString()} MW
                        {typeof pred.forecast_horizon_steps === 'number' && pred.forecast_horizon_steps > 1 && (
                          <span style={{ color: 'var(--text3)' }}> · {pred.forecast_horizon_steps} horizon steps</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* AI Recommendations */}
          <GlowFrame borderRadius={10} className="border-glow--w100 border-glow--flex">
            <div className="sim-recs c glow-strip">
              <div className="c-h"><div className="c-t">Flux AI Recommendations</div><div className="pill">AUTO-GENERATED</div></div>
              <div className="c-b">
                {recommendations.map((r, i) => (
                  <div key={i} className="sim-rec-item">
                    <span className="sim-rec-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="sim-rec-text">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </GlowFrame>

          {/* Raw Response Toggle */}
          <div className="sim-raw-toggle">
            <GlowFrame borderRadius={5} glowRadius={24} glowIntensity={0.65} className="border-glow--inline-flex">
              <button type="button" className="sim-btn-sm glow-strip" onClick={() => setShowRaw(v => !v)}>
                {showRaw ? '▲ Hide' : '▼ Show'} Raw API Response
              </button>
            </GlowFrame>
          </div>
          {showRaw && (
            <pre className="sim-raw">{JSON.stringify(modelResult.rawResponse, null, 2)}</pre>
          )}
        </div>
        </GlowFrame>
      )}

      {/* ── Live twin: what’s being tested + AI activity ── */}
      <GlowFrame borderRadius={12} glowRadius={44} glowIntensity={0.85} className="border-glow--w100 border-glow--flex">
        <div className="sim-twin-viz glow-strip">
        <div className="sim-twin-viz-h">
          <div className="sim-twin-viz-titles">
            <span className="sim-twin-viz-kicker">Digital twin</span>
            <span className="sim-twin-viz-title">Live scenario mirror</span>
          </div>
          <span className="sim-twin-viz-sync">
            <span className="sim-twin-dot" /> {loading ? 'Model running…' : 'Inputs live'}
          </span>
        </div>
        <div className="sim-twin-viz-body">
          <div className="sim-twin-svg-wrap" aria-hidden>
            <svg className="sim-twin-svg" viewBox="0 0 220 220">
              <defs>
                <filter id="simTwinGlow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="2.5" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              {ZONES.map((zone, i) => {
                const n = ZONES.length;
                const a = (i / n) * Math.PI * 2 - Math.PI / 2;
                const ux = Math.cos(a);
                const uy = Math.sin(a);
                const R = 76;
                const zx = 110 + ux * R;
                const zy = 110 + uy * R;
                const zs = zoneStates[zone.id];
                const st = zs.stressType;
                const isStressed = st !== 'none';
                const stroke = isStressed ? stressColor(st) : 'rgba(212,148,46,.22)';
                const x1 = 110 + ux * 22;
                const y1 = 110 + uy * 22;
                const x2 = 110 + ux * (R - 14);
                const y2 = 110 + uy * (R - 14);
                return (
                  <g key={zone.id}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={stroke}
                      strokeWidth={isStressed ? 1.4 : 0.9}
                      strokeDasharray="4 3"
                      opacity={isStressed ? 0.85 : 0.35}
                      className={isStressed ? 'sim-twin-flow--stress' : ''}
                    />
                    <circle
                      cx={zx}
                      cy={zy}
                      r={isStressed ? 13 : 11}
                      fill="oklch(0.09 0.012 58)"
                      stroke={zone.color}
                      strokeWidth={isStressed ? 2 : 1.2}
                      opacity={isStressed ? 1 : 0.75}
                      filter={isStressed ? 'url(#simTwinGlow)' : undefined}
                      className={isStressed ? 'sim-twin-node--pulse' : ''}
                    />
                  </g>
                );
              })}
              <circle cx={110} cy={110} r={20} fill="oklch(0.1 0.02 58)" stroke="#d4942e" strokeWidth="1.5" />
              <text x={110} y={114} textAnchor="middle" fill="#d4a044" fontSize="9" fontWeight="800" fontFamily="Barlow Condensed, sans-serif">
                HUB
              </text>
            </svg>
          </div>
          <div className="sim-twin-viz-col sim-twin-viz-col--test">
            <div className="sim-twin-viz-sec-label">What’s being tested</div>
            <ul className="sim-twin-viz-list">
              {stressedZones.length === 0 ? (
                <li className="sim-twin-viz-li sim-twin-viz-li--nominal">Nominal scenario — no stress flags on zones</li>
              ) : (
                stressedZones.map(z => (
                  <li key={z.id} className="sim-twin-viz-li">
                    <span
                      className="sim-twin-viz-tag"
                      style={{
                        color: stressColor(zoneStates[z.id].stressType),
                        borderColor: stressColor(zoneStates[z.id].stressType),
                      }}
                    >
                      {stressLabel(zoneStates[z.id].stressType)}
                    </span>
                    <span className="sim-twin-viz-li-main">{z.label}</span>
                    <span className="sim-twin-viz-li-sub">{zoneStates[z.id].stressIntensity}%</span>
                  </li>
                ))
              )}
            </ul>
            <div className="sim-twin-viz-env">
              <span>{env.temperature_c}°C</span>
              <span>{env.wind_speed_ms} m/s wind</span>
              <span>{env.cloud_cover_pct}% cloud</span>
              <span className="sim-twin-viz-mode">
                Mode: <strong>{activeStressType === 'surge' ? 'Surge' : activeStressType === 'outage' ? 'Outage' : 'Fluctuation'}</strong> (click zones)
              </span>
            </div>
          </div>
          <div className="sim-twin-viz-col sim-twin-viz-col--ai">
            <div className="sim-twin-viz-sec-label">What the AI is doing</div>
            <ul className="sim-twin-viz-ai">
              {twinAiLines.map((line, i) => (
                <li key={i} className="sim-twin-viz-ai-item">
                  <span className="sim-twin-ai-ico" aria-hidden>
                    {recommendations.length > 0 ? '◆' : '◇'}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {modelResult && recommendations.length > 0 && (
              <div className="sim-twin-viz-foot">Recommendations driven by latest Foundry prediction run</div>
            )}
          </div>
        </div>
        </div>
      </GlowFrame>
      </div>
      </div>
      </div>
    </section>
  );
}

// Just for the display in the header (not a secret)
const MODEL_DISPLAY_RID = 'ri.foundry-ml-live...7ead904f';
