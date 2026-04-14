import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { DecryptedText } from './components/DecryptedText';
import { InfiniteMenu, type InfiniteMenuItem } from './components/InfiniteMenu';
import { SimulationSection } from './components/SimulationSection';
import { WaveDither } from './components/WaveDither';
import { GlowFrame } from './components/GlowFrame';
import { Aurora } from './components/Aurora';
import LineWaves from './components/LineWaves';

Chart.register(...registerables);

function rnd(c: number, mn: number, mx: number, d: number) {
  return Math.max(mn, Math.min(mx, c + (Math.random() - 0.5) * d));
}

/** Shorter duration (faster dash) when MW is a larger share of max generation on the twin diagram. */
function twinFlowAnimSec(mw: number, maxMw: number): number {
  const m = Math.max(maxMw, 1);
  const r = mw / m;
  return Math.max(0.42, Math.min(2.75, 2.7 - r * 2.2));
}

const MSGS = [
  { t: 'action',   m: 'Load shifted 120 MW to battery buffer. Peak absorption in progress.' },
  { t: 'success',  m: 'Solar output stabilized. Generation at 98% forecast.' },
  { t: 'warning',  m: 'Wind declining Sector 7. Gas peaker on standby.' },
  { t: 'info',     m: 'Digital twin: EV wave in ~47 min. Pre-charging +15%.' },
  { t: 'action',   m: 'Demand response: 340 loads deferred 22 min, saving 94 MW.' },
  { t: 'critical', m: 'Voltage sag Node 28-C. Reactive compensation engaged.' },
  { t: 'success',  m: 'Frequency locked 60.01 Hz. Governor confirmed.' },
  { t: 'info',     m: 'Simulating +200 MW data center on District 4.' },
  { t: 'action',   m: 'Battery discharge: 80 MW evening ramp support.' },
  { t: 'warning',  m: 'Nuclear Unit 2 maintenance in 6d. Pre-build started.' },
  { t: 'success',  m: 'Renewable mix hit 70.2% — daily record.' },
  { t: 'info',     m: '91% confidence: demand spike 18:30. Action queued.' },
  { t: 'action',   m: 'V2G: 1,200 EVs Zone C contributing +48 MW.' },
  { t: 'critical', m: 'Forecast +8.2% — NovaTech industrial surge.' },
  { t: 'success',  m: '3 substations rebalanced. +2.1% efficiency.' },
];

interface FeedItem { id: number; type: string; message: string; time: string; }

type Page = 'hero' | 'twin' | 'analytics' | 'agent' | 'simulation';

/** Hub → load segments (viewBox coords). */
const TWIN_HUB_TO_LOAD_LINES: { loadId: string; x1: number; y1: number; x2: number; y2: number; animSec: number; outer: boolean }[] = [
  { loadId: 'ev', x1: 528, y1: 218, x2: 612, y2: 58, animSec: 1.85, outer: false },
  { loadId: 'housing', x1: 528, y1: 224, x2: 612, y2: 118, animSec: 1.95, outer: false },
  { loadId: 'hospital', x1: 528, y1: 230, x2: 612, y2: 178, animSec: 2.05, outer: false },
  { loadId: 'schools', x1: 528, y1: 236, x2: 612, y2: 238, animSec: 2.15, outer: false },
  { loadId: 'retail', x1: 528, y1: 242, x2: 612, y2: 298, animSec: 2.25, outer: false },
  { loadId: 'data', x1: 528, y1: 248, x2: 612, y2: 358, animSec: 2.35, outer: false },
  { loadId: 'offices', x1: 532, y1: 232, x2: 722, y2: 88, animSec: 2.0, outer: true },
  { loadId: 'industry', x1: 532, y1: 238, x2: 722, y2: 158, animSec: 2.1, outer: true },
  { loadId: 'civic', x1: 532, y1: 244, x2: 722, y2: 228, animSec: 2.2, outer: true },
  { loadId: 'warehouse', x1: 532, y1: 250, x2: 722, y2: 298, animSec: 2.3, outer: true },
  { loadId: 'district', x1: 532, y1: 256, x2: 722, y2: 368, animSec: 2.4, outer: true },
];

const TWIN_LOAD_OPTIONS: { id: string; label: string }[] = [
  { id: 'ev', label: 'EV Hub' },
  { id: 'housing', label: 'Housing' },
  { id: 'hospital', label: 'Hospital' },
  { id: 'schools', label: 'Schools' },
  { id: 'retail', label: 'Retail' },
  { id: 'data', label: 'Data center' },
  { id: 'offices', label: 'Offices' },
  { id: 'industry', label: 'Industry' },
  { id: 'civic', label: 'Civic' },
  { id: 'warehouse', label: 'Warehouse' },
  { id: 'district', label: 'District' },
];

/** 1 = life-safety & mobility backbone; 4 = discretionary / sheddable first. */
const TWIN_LOAD_TIER: Record<string, 1 | 2 | 3 | 4> = {
  hospital: 1,
  data: 1,
  ev: 1,
  schools: 2,
  civic: 2,
  housing: 2,
  retail: 3,
  offices: 3,
  industry: 3,
  warehouse: 4,
  district: 4,
};

const TWIN_TIER_LABELS: { tier: 1 | 2 | 3 | 4; title: string }[] = [
  { tier: 1, title: 'Critical — hospitals, data, EV / traffic' },
  { tier: 2, title: 'Essential — schools, civic, housing' },
  { tier: 3, title: 'Commercial — retail, offices, industry' },
  { tier: 4, title: 'Discretionary — warehouse, district' },
];

const TWIN_LOAD_NODE_R = 18;

/** Grid hub center (matches `translate(485,240)` hub group). */
const TWIN_HUB_CX = 485;
const TWIN_HUB_CY = 240;

/** Pick the most vestigial load that can be curtailed to backfill a higher-priority outage. */
function twinPickDonorLoad(outageId: string): string | null {
  const need = TWIN_LOAD_TIER[outageId];
  if (need === undefined) return null;
  const candidates = Object.entries(TWIN_LOAD_TIER)
    .filter(([id, tier]) => id !== outageId && tier > need)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return candidates[0]?.[0] ?? null;
}

/** Reroute path: donor load → along donor spoke into hub → hub center → along outage spoke → outage load. */
function twinHubReroutePolylinePoints(donorId: string, outageId: string): { x: number; y: number }[] | null {
  const d = TWIN_HUB_TO_LOAD_LINES.find(l => l.loadId === donorId);
  const o = TWIN_HUB_TO_LOAD_LINES.find(l => l.loadId === outageId);
  if (!d || !o) return null;
  const r = TWIN_LOAD_NODE_R;
  const ddx = d.x1 - d.x2;
  const ddy = d.y1 - d.y2;
  const dlen = Math.hypot(ddx, ddy) || 1;
  const dux = ddx / dlen;
  const duy = ddy / dlen;
  const donorEdge = { x: d.x2 + dux * r, y: d.y2 + duy * r };
  const donorHub = { x: d.x1, y: d.y1 };
  const odx = o.x2 - o.x1;
  const ody = o.y2 - o.y1;
  const olen = Math.hypot(odx, ody) || 1;
  const oux = odx / olen;
  const ouy = ody / olen;
  const outageHub = { x: o.x1, y: o.y1 };
  const outageEdge = { x: o.x2 - oux * r, y: o.y2 - ouy * r };
  return [
    donorEdge,
    donorHub,
    { x: TWIN_HUB_CX, y: TWIN_HUB_CY },
    outageHub,
    outageEdge,
  ];
}

function twinLoadNodeClass(
  id: string,
  active: boolean,
  outageId: string | null,
  donorId: string | null,
): string | undefined {
  if (!active) return undefined;
  if (outageId === id) return 'twin-load-node--outage';
  if (donorId === id) return 'twin-load-node--shed';
  return undefined;
}

const NAV: { id: Page; label: string; icon: JSX.Element }[] = [
  { id: 'hero', label: 'Home', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { id: 'twin', label: 'Digital Twin', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
  { id: 'analytics', label: 'Analytics', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { id: 'agent', label: 'AI Agent', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  { id: 'simulation', label: 'Simulation', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 3H5a2 2 0 0 0-2 2v4"/><path d="M9 21H5a2 2 0 0 1-2-2v-4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M15 21h4a2 2 0 0 0 2-2v-4"/><circle cx="12" cy="12" r="3"/></svg> },
];

const INFINITE_MENU_ITEMS: InfiniteMenuItem[] = [
  {
    image: '/infinite-menu/digital-twin.png',
    title: 'Digital Twin',
    description: 'Live hub & twin topology.',
    page: 'twin',
  },
  {
    image: '/infinite-menu/forecasting.png',
    title: 'Forecasting',
    description: 'Load outlook & horizons.',
    page: 'analytics',
  },
  {
    image: '/infinite-menu/logs.png',
    title: 'Logs',
    description: 'Mix & decision telemetry.',
    page: 'agent',
  },
  {
    image: '/infinite-menu/simulation.png',
    title: 'Simulation',
    description: 'Grid hub, flows & loads.',
    page: 'simulation',
  },
  {
    image: '/infinite-menu/home.png',
    title: 'Home',
    description: 'Nova City landing & status.',
    page: 'hero',
  },
];

export function FluxDashboard() {
  const [page, setPage] = useState<Page>('hero');
  const [clockStr, setClockStr] = useState('');
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [twinFlowMw, setTwinFlowMw] = useState({ solar: 842, wind: 623, nuclear: 1200, battery: 240 });
  const [twinOutage, setTwinOutage] = useState<{
    loadId: string | null;
    active: boolean;
  }>({ loadId: null, active: false });
  const [shiftKeyHeld, setShiftKeyHeld] = useState(false);
  /** Bumps after each ring commit so `<InfiniteMenu>` remounts with fresh rotation. */
  const [ringMenuVersion, setRingMenuVersion] = useState(0);
  const S = useRef({ solar: 842, wind: 623, nuclear: 1200, battery: 240, gas: 135, demand: 2710, freq: 60.01, volt: 234, batPct: 78, stability: 97.4, decisions: 1243, totalDec: 14832 });
  const N = 60;
  const supH = useRef<number[]>([]);
  const demH = useRef<number[]>([]);
  const resH = useRef<number[]>([]);

  const anSdEl  = useRef<HTMLCanvasElement>(null);
  const anMixEl = useRef<HTMLCanvasElement>(null);
  const anFcEl  = useRef<HTMLCanvasElement>(null);
  const anSd        = useRef<Chart | null>(null);
  const anMixChart  = useRef<Chart | null>(null);
  const anFcChart   = useRef<Chart | null>(null);

  const msgIdx = useRef(0);
  const feedId = useRef(0);
  const chartsInit = useRef(false);
  const ringPageRef = useRef<Page | null>(null);
  const prevShiftHeld = useRef(false);

  useEffect(() => {
    const sync = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      setShiftKeyHeld(e.shiftKey);
    };
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    const blur = () => {
      setShiftKeyHeld(false);
    };
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const showInfiniteMenu = shiftKeyHeld;
  useEffect(() => {
    document.body.style.overflow = showInfiniteMenu ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [showInfiniteMenu]);

  useEffect(() => {
    if (prevShiftHeld.current && !shiftKeyHeld && ringPageRef.current) {
      setPage(ringPageRef.current);
      setRingMenuVersion(v => v + 1);
    }
    prevShiftHeld.current = shiftKeyHeld;
  }, [shiftKeyHeld]);

  // Init charts when analytics page mounts
  useEffect(() => {
    if (page !== 'analytics' || chartsInit.current) return;
    chartsInit.current = true;

    const xL = Array.from({ length: N }, (_, i) => { const m = N - 1 - i; return m === 0 ? 'Now' : `-${m}m`; });
    const tt = { backgroundColor: '#0a0805', borderColor: 'rgba(212,148,46,.15)', borderWidth: 1, padding: 10, cornerRadius: 6 };

    if (anSdEl.current) {
      anSd.current = new Chart(anSdEl.current.getContext('2d')!, {
        type: 'line',
        data: { labels: xL, datasets: [
          { label: 'Supply', data: [...supH.current], borderColor: '#d4942e', backgroundColor: 'rgba(212,148,46,.06)', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.4 } as any,
          { label: 'Demand', data: [...demH.current], borderColor: '#d4614a', backgroundColor: 'rgba(212,97,74,.04)', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.4 } as any,
          { label: 'Reserve', data: [...resH.current], borderColor: 'rgba(212,148,46,.35)', backgroundColor: 'rgba(212,148,46,.03)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.4, borderDash: [4, 3] } as any,
        ]},
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: { ...tt as any, callbacks: { label: (c: any) => ` ${c.dataset.label}: ${c.raw.toLocaleString()} MW` } } },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 8, color: '#3a3020', font: { size: 11 } } },
            y: { grid: { color: 'rgba(255,255,255,.018)' }, min: 0, max: 3600, ticks: { callback: (v: any) => (v / 1000).toFixed(1) + 'G', color: '#3a3020', font: { size: 11 } } },
          },
        },
      });
    }
    if (anMixEl.current) {
      const s = S.current;
      anMixChart.current = new Chart(anMixEl.current.getContext('2d')!, {
        type: 'doughnut',
        data: { labels: ['Solar', 'Wind', 'Nuclear', 'Battery', 'Gas'], datasets: [{ data: [s.solar, s.wind, s.nuclear, s.battery, s.gas], backgroundColor: ['rgba(234,179,8,.65)', 'rgba(125,211,252,.65)', 'rgba(168,85,247,.65)', 'rgba(249,115,22,.65)', 'rgba(107,114,128,.65)'], borderColor: ['#eab308', '#7dd3fc', '#a855f7', '#f97316', '#6b7280'], borderWidth: 1.5 }] },
        options: { responsive: true, maintainAspectRatio: true, cutout: '68%', plugins: { legend: { position: 'right', labels: { padding: 10, boxWidth: 10, boxHeight: 10, color: '#6a5e4a', font: { size: 12 } } }, tooltip: { ...tt as any, callbacks: { label: (c: any) => ` ${c.label}: ${c.raw} MW` } } } },
      });
    }
    if (anFcEl.current) {
      const fcD = [2100, 1950, 1820, 1900, 2200, 2450, 2620, 2780, 2920, 3110, 2960, 2720, 2350];
      const fcL = ['00', '02', '04', '06', '08', '10', '12', '14', '16', '18', '20', '22', '24'];
      const cH = Math.floor(new Date().getHours() / 2);
      const fcC = fcD.map((v, i) => { if (i < cH) return 'rgba(74,62,42,.5)'; if (v > 2900) return 'rgba(212,97,74,.65)'; if (v > 2700) return 'rgba(212,148,46,.6)'; return 'rgba(212,148,46,.42)'; });
      anFcChart.current = new Chart(anFcEl.current.getContext('2d')!, {
        type: 'bar',
        data: { labels: fcL, datasets: [
          { data: fcD, backgroundColor: fcC, borderColor: 'transparent', borderWidth: 0, borderRadius: 3 } as any,
          { type: 'line', data: fcD, borderColor: '#d4942e', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.4 } as any,
        ]},
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { ...tt as any, callbacks: { label: (c: any) => ` ${(c.raw / 1000).toFixed(2)} GW` } } },
          scales: { x: { grid: { display: false }, ticks: { color: '#3a3020', font: { size: 11 } } }, y: { grid: { color: 'rgba(255,255,255,.018)' }, min: 1500, max: 3500, ticks: { callback: (v: any) => (v / 1000).toFixed(1) + 'G', color: '#3a3020', font: { size: 11 } } } },
        },
      });
    }
  }, [page]);

  useEffect(() => {
    const clockTick = () => setClockStr(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }));
    clockTick();
    const clockInterval = setInterval(clockTick, 1000);

    for (let i = 0; i < N; i++) {
      const t = i / N;
      supH.current.push(Math.round(2800 + Math.sin(t * Math.PI * 3) * 130 + (Math.random() - 0.5) * 70));
      demH.current.push(Math.round(2640 + Math.sin(t * Math.PI * 2 + 0.5) * 110 + (Math.random() - 0.5) * 60));
      resH.current.push(supH.current[i] - demH.current[i]);
    }

    const initItems: FeedItem[] = [];
    for (let i = 0; i < 8; i++) {
      const { t, m } = MSGS[msgIdx.current++ % MSGS.length];
      initItems.unshift({ id: feedId.current++, type: t, message: m, time: new Date().toLocaleTimeString('en-US', { hour12: false }) });
    }
    setFeed(initItems);

    const feedInterval = setInterval(() => {
      const { t, m } = MSGS[msgIdx.current++ % MSGS.length];
      setFeed(prev => [{ id: feedId.current++, type: t, message: m, time: new Date().toLocaleTimeString('en-US', { hour12: false }) }, ...prev].slice(0, 20));
    }, 4000);

    const set = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const setHTML = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };

    const tick = () => {
      const s = S.current;
      s.solar    = rnd(s.solar,    80,   1400, 45);
      s.wind     = rnd(s.wind,     40,   950,  38);
      s.nuclear  = rnd(s.nuclear,  1100, 1300, 12);
      s.battery  = rnd(s.battery,  0,    500,  28);
      s.gas      = rnd(s.gas,      40,   420,  18);
      s.demand   = rnd(s.demand,   1900, 3200, 55);
      s.freq     = rnd(s.freq,     59.78, 60.22, 0.06);
      s.volt     = rnd(s.volt,     228,  240,  1.2);
      s.batPct   = rnd(s.batPct,   15,   100,  1.1);
      s.stability = rnd(s.stability, 60, 100,  3);
      s.decisions = Math.round(1180 + Math.random() * 240);
      s.totalDec += Math.round(s.decisions / 1800);

      const T = s.solar + s.wind + s.nuclear + s.battery + s.gas;
      const ren = Math.round((s.solar + s.wind) / T * 100);
      const res = (T - s.demand) / s.demand * 100;

      set('hb-health', s.stability.toFixed(1) + '%');
      set('hb-dec', s.decisions.toLocaleString());
      set('tw-solar', Math.round(s.solar) + ' MW');
      set('tw-wind',  Math.round(s.wind)  + ' MW');
      set('tw-nuc',   (s.nuclear / 1000).toFixed(2) + ' GW');
      set('tw-bat',   Math.round(s.batPct) + '%');
      set('lbl-solar', Math.round(s.solar) + ' MW');
      set('lbl-wind',  Math.round(s.wind)  + ' MW');
      set('lbl-nuc',   (s.nuclear / 1000).toFixed(2) + ' GW');
      set('lbl-bat',   Math.round(s.batPct) + '%');
      const batFill = document.getElementById('bat-fill');
      if (batFill) batFill.setAttribute('width', String(Math.max(2, Math.round(s.batPct / 100 * 30))));

      // Twin detail stats
      setHTML('td-gen',  (T / 1000).toFixed(2) + ' <span>GW</span>');
      setHTML('td-dem',  (s.demand / 1000).toFixed(2) + ' <span>GW</span>');
      setHTML('td-freq', s.freq.toFixed(2) + ' <span>Hz</span>');
      setHTML('td-ren',  ren + '<span>%</span>');
      set('td-volt',  Math.round(s.volt) + ' kV');
      set('td-bat',   Math.round(s.batPct) + '%');
      set('td-res',   (res >= 0 ? '+' : '') + res.toFixed(1) + '%');
      set('td-stab',  s.stability.toFixed(1) + '%');

      set('ag-rate',  s.decisions.toLocaleString() + '/hr');
      set('ag-total', s.totalDec.toLocaleString());
      setHTML('ag-ren', ren + '<span>%</span>');
      setHTML('ag-bat', Math.round(s.batPct) + '<span>%</span>');

      supH.current.push(Math.round(T)); supH.current.shift();
      demH.current.push(Math.round(s.demand)); demH.current.shift();
      resH.current.push(Math.round(T - s.demand)); resH.current.shift();

      if (anSd.current) {
        anSd.current.data.datasets[0].data = [...supH.current];
        anSd.current.data.datasets[1].data = [...demH.current];
        anSd.current.data.datasets[2].data = [...resH.current];
        anSd.current.update('none');
      }
      if (anMixChart.current) {
        anMixChart.current.data.datasets[0].data = [s.solar, s.wind, s.nuclear, s.battery, s.gas].map(Math.round);
        anMixChart.current.update('none');
        set('an-total', Math.round(T).toLocaleString() + ' MW');
      }

      setTwinFlowMw({ solar: s.solar, wind: s.wind, nuclear: s.nuclear, battery: s.battery });
    };
    tick();
    const tickInterval = setInterval(tick, 2000);

    return () => {
      clearInterval(clockInterval);
      clearInterval(feedInterval);
      clearInterval(tickInterval);
      [anSd.current, anMixChart.current, anFcChart.current].forEach(c => c?.destroy());
    };
  }, []);

  const twinMaxMw = Math.max(twinFlowMw.solar, twinFlowMw.wind, twinFlowMw.nuclear, twinFlowMw.battery, 1);
  const twinDonorId = twinOutage.loadId ? twinPickDonorLoad(twinOutage.loadId) : null;
  const twinCanSimulate = Boolean(twinOutage.loadId && twinDonorId);

  /** Aurora: dark red while outage simulation runs; bright emerald when nominal. */
  const twinAuroraStops = useMemo(() => {
    if (twinOutage.active) {
      return ['#1a0505', '#6b1010', '#9f1239'];
    }
    return ['#166534', '#22c55e', '#86efac'];
  }, [twinOutage.active]);

  return (
    <>
      {/* ── SIDEBAR ── */}
      <nav className="sb">
        <div className="sb-logo" onClick={() => setPage('hero')}>Φ</div>
        <div className="sb-nav">
          {NAV.map(n => (
            <button key={n.id} className={`sb-btn${page === n.id ? ' on' : ''}`} onClick={() => setPage(n.id)}>
              {n.icon}
              <span className="sb-tip">{n.label}</span>
            </button>
          ))}
        </div>
        <div className="sb-live" />
        <div className="sb-clock">{clockStr}</div>
      </nav>

      {/* ── PAGE CONTAINER ── */}
      <div className="pg-root">

        {/* ══ HOME ══ */}
        {page === 'hero' && (
          <div className="pg pg-hero">
            <div className="hero-dither-bg" aria-hidden>
              <WaveDither
                waveColor={[0.72, 0.46, 0.18]}
                disableAnimation={false}
                enableMouseInteraction={false}
                mouseRadius={0}
                colorNum={4}
                pixelSize={2}
                waveAmplitude={0.35}
                waveFrequency={2.8}
                waveSpeed={0.045}
              />
            </div>
            <div className="hero-vignette" aria-hidden />
            <div className="hero-inner">
              <div className="hero-label">Nova City Grid Intelligence</div>
              <span className="hero-phi">Φ</span>
              <div className="hero-name-wrap">
                <div className="hero-bg-phi">Φ</div>
                <DecryptedText
                  text="Flux"
                  animateOn="mount"
                  speed={48}
                  maxIterations={44}
                  characters="ΦFLUX█▓░?01Ω"
                  className="hero-name"
                  encryptedClassName="hero-name-encrypted"
                  sequential
                  revealDirection="start"
                />
              </div>
              <div className="hero-tagline">Autonomous energy management for a resilient grid.</div>
              <div className="hero-nav">
                {NAV.filter(n => n.id !== 'hero').map(n => (
                  <GlowFrame
                    key={n.id}
                    borderRadius={5}
                    backgroundColor="rgba(10, 8, 16, 0.5)"
                    glowIntensity={0.75}
                    className="border-glow--inline-flex"
                  >
                    <button type="button" className="hero-nav-btn glow-strip" onClick={() => setPage(n.id)}>
                      {n.label}
                    </button>
                  </GlowFrame>
                ))}
              </div>
              <div className="hero-bar">
                <div className="hero-bar-item">
                  <span className="sb-live" style={{ display: 'inline-block', verticalAlign: 'middle' }} />
                  AIP Online
                </div>
                <div className="hero-bar-item">
                  <span className="hero-bar-v" id="hb-health">97.4%</span>
                  Grid Health
                </div>
                <div className="hero-bar-item">
                  <span className="hero-bar-v" id="hb-dec">1,243</span>
                  Decisions/hr
                </div>
                <div className="hero-bar-item" title="Mean absolute percentage error — forecast vs realized load">
                  <span className="hero-bar-v">~95%</span>
                  Accurate (MAPE)
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ DIGITAL TWIN ══ */}
        {page === 'twin' && (
          <div className="pg pg-scroll pg-twin">
            <Aurora
              colorStops={twinAuroraStops}
              blend={0.52}
              amplitude={1.08}
              speed={0.36}
              className="twin-aurora"
            />
            <div className="pg-inner pg-twin-content pg-inner--twin">
              <div className="sec-header">
                <div className="sec-label">Digital Twin</div>
                <div className="sec-title">Live Infrastructure Model</div>
                <div className="sec-sub">Virtual replica updated every 500ms — live figures sit under Grid Metrics on the diagram</div>
                <div className="sec-desc">A synchronized mirror of the physical grid — every energy flow, node state, and asset output is replicated in real time. Flux uses this model to simulate interventions before executing them on the live system.</div>
              </div>

              <GlowFrame className="border-glow--w100 border-glow--flex">
                <div className="twin-outage-bar glow-strip">
                  <div className="twin-tier-strip" title="Load priority for AI curtailment routing">
                    {TWIN_TIER_LABELS.map(({ tier, title }) => (
                      <GlowFrame key={tier} borderRadius={4} glowRadius={28} glowIntensity={0.65} className="border-glow--inline-flex">
                        <span className={`twin-tier-pill twin-tier-pill--${tier} glow-strip`} title={title}>
                          T{tier}
                        </span>
                      </GlowFrame>
                    ))}
                    <span className="twin-tier-hint">T1 most protected · T4 shed first</span>
                  </div>
                  <span className="twin-outage-bar-lbl">Outage at</span>
                  <GlowFrame borderRadius={6} glowRadius={26} glowIntensity={0.65} className="border-glow--inline-flex">
                    <select
                      className="twin-outage-select glow-strip"
                      value={twinOutage.loadId ?? ''}
                      onChange={e => setTwinOutage(o => ({ ...o, loadId: e.target.value || null, active: false }))}
                    >
                      <option value="">— Choose load —</option>
                      {TWIN_LOAD_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label} (T{TWIN_LOAD_TIER[opt.id]})
                        </option>
                      ))}
                    </select>
                  </GlowFrame>
                  {twinOutage.loadId && twinDonorId && (
                    <span className="twin-outage-routing">
                      Curtail <strong>{TWIN_LOAD_OPTIONS.find(o => o.id === twinDonorId)?.label ?? twinDonorId}</strong>
                      {' '}— power returns along its hub line → <strong>grid hub</strong> →{' '}
                      <strong>{TWIN_LOAD_OPTIONS.find(o => o.id === twinOutage.loadId)?.label}</strong> feed
                    </span>
                  )}
                  {twinOutage.loadId && !twinDonorId && (
                    <span className="twin-outage-routing twin-outage-routing--warn">No lower-priority load to shed — pick a higher-tier node</span>
                  )}
                  <GlowFrame borderRadius={6} glowRadius={26} glowIntensity={0.7} className="border-glow--inline-flex">
                    <button
                      type="button"
                      className="twin-outage-btn twin-outage-btn--go glow-strip"
                      disabled={!twinCanSimulate}
                      onClick={() => twinCanSimulate && setTwinOutage(o => ({ ...o, active: true }))}
                    >
                      Simulate
                    </button>
                  </GlowFrame>
                  <GlowFrame borderRadius={6} glowRadius={26} glowIntensity={0.7} className="border-glow--inline-flex">
                    <button
                      type="button"
                      className="twin-outage-btn glow-strip"
                      onClick={() => setTwinOutage({ loadId: null, active: false })}
                    >
                      Reset
                    </button>
                  </GlowFrame>
                </div>
              </GlowFrame>

              {/* Twin SVG — sources in a left column; flow line speed ∝ MW (live) */}
              <GlowFrame
                className="border-glow--w100"
                backgroundColor="oklch(0.07 0.008 58)"
                borderRadius={10}
                glowRadius={44}
                glowIntensity={0.88}
              >
                <div className="twin-wrap twin-wrap--sources-left glow-strip">
                  <div className="twin-scan" />
                  {twinOutage.active && twinOutage.loadId && twinDonorId && (
                    <GlowFrame
                      borderRadius={8}
                      backgroundColor="oklch(0.55 0.14 200 / 0.14)"
                      glowRadius={32}
                      glowIntensity={0.7}
                      className="twin-ai-banner-glow"
                    >
                      <div className="twin-ai-banner glow-strip">
                        Live loads highlighted —{' '}
                        <strong>{TWIN_LOAD_OPTIONS.find(o => o.id === twinDonorId)?.label ?? twinDonorId}</strong>
                        {' '}curtailed; power path: donor line → <strong>hub</strong> → outage line to{' '}
                        <strong>{TWIN_LOAD_OPTIONS.find(o => o.id === twinOutage.loadId)?.label ?? twinOutage.loadId}</strong>
                      </div>
                    </GlowFrame>
                  )}
                  <div className="twin-tags twin-tags--overlay">
                    <GlowFrame borderRadius={5} glowRadius={24} glowIntensity={0.6} className="border-glow--inline-flex">
                      <div className="tw-tag glow-strip"><span className="tw-dot" style={{ background: 'var(--a)' }} />Grid Hub Active</div>
                    </GlowFrame>
                    <GlowFrame borderRadius={5} glowRadius={24} glowIntensity={0.6} className="border-glow--inline-flex">
                      <div className="tw-tag glow-strip"><span className="tw-dot" style={{ background: '#eab308' }} />Solar <strong id="tw-solar" style={{ color: 'var(--text)', marginLeft: 3 }}>842 MW</strong></div>
                    </GlowFrame>
                    <GlowFrame borderRadius={5} glowRadius={24} glowIntensity={0.6} className="border-glow--inline-flex">
                      <div className="tw-tag glow-strip"><span className="tw-dot" style={{ background: '#7dd3fc' }} />Wind <strong id="tw-wind" style={{ color: 'var(--text)', marginLeft: 3 }}>623 MW</strong></div>
                    </GlowFrame>
                    <GlowFrame borderRadius={5} glowRadius={24} glowIntensity={0.6} className="border-glow--inline-flex">
                      <div className="tw-tag glow-strip"><span className="tw-dot" style={{ background: '#a855f7' }} />Nuclear <strong id="tw-nuc" style={{ color: 'var(--text)', marginLeft: 3 }}>1.20 GW</strong></div>
                    </GlowFrame>
                    <GlowFrame borderRadius={5} glowRadius={24} glowIntensity={0.6} className="border-glow--inline-flex">
                      <div className="tw-tag glow-strip"><span className="tw-dot" style={{ background: 'var(--orange)' }} />Battery <strong id="tw-bat" style={{ color: 'var(--text)', marginLeft: 3 }}>78%</strong></div>
                    </GlowFrame>
                  </div>
                  <GlowFrame borderRadius={10} backgroundColor="oklch(0.07 0.008 58 / 0.9)" glowRadius={36} glowIntensity={0.75}>
                    <div className="twin-metrics-panel glow-strip">
                  <div className="twin-metrics-heading">Grid Metrics</div>
                  <div className="twin-metrics-grid twin-metrics-grid--embed">
                    <div className="twin-metric">
                      <div className="twin-metric-l">Generation</div>
                      <div className="twin-metric-v accent" id="td-gen">2.84 <span>GW</span></div>
                    </div>
                    <div className="twin-metric">
                      <div className="twin-metric-l">Demand</div>
                      <div className="twin-metric-v" id="td-dem">2.71 <span>GW</span></div>
                    </div>
                    <div className="twin-metric">
                      <div className="twin-metric-l">Frequency</div>
                      <div className="twin-metric-v accent" id="td-freq">60.01 <span>Hz</span></div>
                    </div>
                    <div className="twin-metric">
                      <div className="twin-metric-l">Renewable Mix</div>
                      <div className="twin-metric-v accent" id="td-ren">68<span>%</span></div>
                    </div>
                    <div className="twin-metric">
                      <div className="twin-metric-l">Voltage</div>
                      <div className="twin-metric-v" id="td-volt">234 kV</div>
                    </div>
                    <div className="twin-metric">
                      <div className="twin-metric-l">Battery SoC</div>
                      <div className="twin-metric-v" id="td-bat">78%</div>
                    </div>
                    <div className="twin-metric">
                      <div className="twin-metric-l">Reserve Margin</div>
                      <div className="twin-metric-v accent" id="td-res">+4.8%</div>
                    </div>
                    <div className="twin-metric">
                      <div className="twin-metric-l">System Stability</div>
                      <div className="twin-metric-v accent" id="td-stab">97.4%</div>
                    </div>
                  </div>
                    </div>
                  </GlowFrame>
                <svg viewBox="0 0 800 480" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <pattern id="gp" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0L0 0 0 30" fill="none" stroke="rgba(212,148,46,.06)" strokeWidth=".5"/></pattern>
                    <radialGradient id="rS"><stop offset="0%" stopColor="#eab308" stopOpacity=".2"/><stop offset="100%" stopColor="#eab308" stopOpacity="0"/></radialGradient>
                    <radialGradient id="rW"><stop offset="0%" stopColor="#7dd3fc" stopOpacity=".2"/><stop offset="100%" stopColor="#7dd3fc" stopOpacity="0"/></radialGradient>
                    <radialGradient id="rN"><stop offset="0%" stopColor="#a855f7" stopOpacity=".25"/><stop offset="100%" stopColor="#a855f7" stopOpacity="0"/></radialGradient>
                    <radialGradient id="rB"><stop offset="0%" stopColor="#f97316" stopOpacity=".18"/><stop offset="100%" stopColor="#f97316" stopOpacity="0"/></radialGradient>
                    <radialGradient id="rH"><stop offset="0%" stopColor="#d4942e" stopOpacity=".2"/><stop offset="100%" stopColor="#d4942e" stopOpacity="0"/></radialGradient>
                    <filter id="fg"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                  </defs>
                  <rect width="800" height="480" fill="url(#gp)"/>
                  <g stroke="rgba(212,148,46,.04)" strokeWidth="1"><line x1="0" y1="240" x2="800" y2="240"/><line x1="485" y1="0" x2="485" y2="480"/></g>
                  {/* Flow lines: faster animation = higher MW (twinFlowAnimSec) */}
                  <line x1="152" y1="72" x2="428" y2="236" stroke="#eab308" strokeWidth="1.35" opacity=".45" className="twin-flow-line" style={{ animation: `flAn ${twinFlowAnimSec(twinFlowMw.solar, twinMaxMw)}s linear infinite` }} />
                  <line x1="152" y1="168" x2="428" y2="238" stroke="#7dd3fc" strokeWidth="1.35" opacity=".45" className="twin-flow-line" style={{ animation: `flAn ${twinFlowAnimSec(twinFlowMw.wind, twinMaxMw)}s linear infinite` }} />
                  <line x1="152" y1="264" x2="428" y2="240" stroke="#a855f7" strokeWidth="1.35" opacity=".45" className="twin-flow-line" style={{ animation: `flAn ${twinFlowAnimSec(twinFlowMw.nuclear, twinMaxMw)}s linear infinite` }} />
                  <line x1="152" y1="360" x2="428" y2="242" stroke="#f97316" strokeWidth="1.35" opacity=".4" className="twin-flow-line" style={{ animation: `flAn ${twinFlowAnimSec(twinFlowMw.battery, twinMaxMw)}s linear infinite` }} />
                  <line x1="485" y1="188" x2="485" y2="292" stroke="#d4942e" strokeWidth="2" opacity=".55" className="twin-flow-line" style={{ animation: 'flAn 2s linear infinite' }} />
                  {/* Hub → loads; impaired when simulated outage */}
                  {TWIN_HUB_TO_LOAD_LINES.map(seg => {
                    const isOut = twinOutage.active && twinOutage.loadId === seg.loadId;
                    const isDonor = twinOutage.active && twinDonorId === seg.loadId;
                    const glowLive = twinOutage.active && !isOut && !isDonor;
                    const stroke = isOut ? '#ef4444' : isDonor ? '#f59e0b' : seg.outer ? '#b8955a' : '#c4a574';
                    const opacity = isOut ? 0.26 : isDonor ? 0.24 : seg.outer ? 0.28 : 0.32;
                    return (
                      <line
                        key={seg.loadId}
                        x1={seg.x1}
                        y1={seg.y1}
                        x2={seg.x2}
                        y2={seg.y2}
                        stroke={stroke}
                        strokeWidth={isOut || isDonor ? 1.2 : 0.75}
                        strokeDasharray={isOut ? '4 10' : isDonor ? '3 8' : undefined}
                        opacity={opacity}
                        className={[
                          'twin-flow-line',
                          isOut ? 'twin-hub-line--outage' : '',
                          glowLive ? 'twin-load-line--live-glow' : '',
                          isDonor ? 'twin-load-line--shed' : '',
                        ].filter(Boolean).join(' ')}
                        style={isOut ? undefined : { animation: `flAn ${seg.animSec}s linear infinite` }}
                      />
                    );
                  })}
                  <g transform="translate(92,72)"><circle r="44" fill="url(#rS)"/><g filter="url(#fg)" className="ng"><rect x="-22" y="-12" width="9" height="7" rx="1.5" fill="#eab308" opacity=".85"/><rect x="-11" y="-12" width="9" height="7" rx="1.5" fill="#eab308" opacity=".85"/><rect x="0" y="-12" width="9" height="7" rx="1.5" fill="#eab308" opacity=".85"/><rect x="11" y="-12" width="9" height="7" rx="1.5" fill="#eab308" opacity=".85"/><rect x="-22" y="-2" width="9" height="7" rx="1.5" fill="#eab308" opacity=".55"/><rect x="-11" y="-2" width="9" height="7" rx="1.5" fill="#eab308" opacity=".55"/><rect x="0" y="-2" width="9" height="7" rx="1.5" fill="#eab308" opacity=".55"/><rect x="11" y="-2" width="9" height="7" rx="1.5" fill="#eab308" opacity=".55"/></g><text y="24" textAnchor="middle" fill="#eab308" fontSize="11" fontWeight="700" opacity=".85">SOLAR</text><text y="37" textAnchor="middle" fill="#eab308" fontSize="9" id="lbl-solar" opacity=".7">842 MW</text></g>
                  <g transform="translate(92,168)"><circle r="42" fill="url(#rW)"/><g filter="url(#fg)" className="ng"><line x1="0" y1="0" x2="0" y2="-18" stroke="#7dd3fc" strokeWidth="2.2" strokeLinecap="round"/><line x1="0" y1="0" x2="-15" y2="9" stroke="#7dd3fc" strokeWidth="2.2" strokeLinecap="round"/><line x1="0" y1="0" x2="15" y2="9" stroke="#7dd3fc" strokeWidth="2.2" strokeLinecap="round"/><circle r="3" fill="#7dd3fc"/></g><text y="28" textAnchor="middle" fill="#7dd3fc" fontSize="11" fontWeight="700" opacity=".85">WIND</text><text y="40" textAnchor="middle" fill="#7dd3fc" fontSize="9" id="lbl-wind" opacity=".7">623 MW</text></g>
                  <g transform="translate(92,264)"><circle r="42" fill="url(#rN)"/><g filter="url(#fg)" className="ng"><circle r="6" fill="#a855f7"/><path d="M0,-6 A6,6 0 0,1 5.2,-3 L13,-9 A18,18 0 0,0 0,-20 Z" fill="#a855f7" opacity=".5"/><path d="M5.2,-3 A6,6 0 0,1 5.2,3 L13,9 A18,18 0 0,0 13,-9 Z" fill="#a855f7" opacity=".35"/><path d="M5.2,3 A6,6 0 0,1 0,6 L0,20 A18,18 0 0,0 13,9 Z" fill="#a855f7" opacity=".2"/></g><text y="26" textAnchor="middle" fill="#a855f7" fontSize="11" fontWeight="700" opacity=".85">NUCLEAR</text><text y="38" textAnchor="middle" fill="#a855f7" fontSize="9" id="lbl-nuc" opacity=".7">1.20 GW</text></g>
                  <g transform="translate(92,360)"><circle r="42" fill="url(#rB)"/><g filter="url(#fg)" className="ng"><rect x="-20" y="-12" width="40" height="22" rx="4" fill="none" stroke="#f97316" strokeWidth="2.2"/><rect x="20" y="-6" width="5" height="10" rx="1.5" fill="#f97316"/><rect id="bat-fill" x="-16" y="-8" width="26" height="14" rx="2.5" fill="#f97316" opacity=".7"/></g><text y="24" textAnchor="middle" fill="#f97316" fontSize="11" fontWeight="700" opacity=".85">BATTERY</text><text y="36" textAnchor="middle" fill="#f97316" fontSize="9" id="lbl-bat" opacity=".7">78%</text></g>
                  <g transform="translate(485,240)"><circle r="52" fill="url(#rH)"/><circle r="26" fill="oklch(0.08 0.010 58)" stroke="#d4942e" strokeWidth="1.5" className="ng" style={{ filter: 'drop-shadow(0 0 8px rgba(212,148,46,.35))' }}/><circle r="16" fill="oklch(0.11 0.010 58)" stroke="#d4942e" strokeWidth=".8" opacity=".35"/><circle r="5" fill="#d4942e"/><line x1="0" y1="-11" x2="0" y2="-6" stroke="#d4942e" strokeWidth="1.5"/><line x1="0" y1="6" x2="0" y2="11" stroke="#d4942e" strokeWidth="1.5"/><line x1="-11" y1="0" x2="-6" y2="0" stroke="#d4942e" strokeWidth="1.5"/><line x1="6" y1="0" x2="11" y2="0" stroke="#d4942e" strokeWidth="1.5"/><text y="40" textAnchor="middle" fill="#d4a044" fontSize="11" fontWeight="800">GRID HUB</text><circle r="26" fill="none" stroke="#d4942e" strokeWidth=".6"><animate attributeName="r" values="26;55" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values=".4;0" dur="3s" repeatCount="indefinite"/></circle></g>
                  {twinOutage.active && twinOutage.loadId && twinDonorId && (() => {
                    const pts = twinHubReroutePolylinePoints(twinDonorId, twinOutage.loadId);
                    if (!pts?.length) return null;
                    return (
                      <polyline
                        points={pts.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke="#34d399"
                        strokeWidth={2.35}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        opacity={0.92}
                        className="twin-flow-line twin-ai-reroute-line"
                        style={{ animation: `flAn ${twinFlowAnimSec(twinFlowMw.battery, twinMaxMw)}s linear infinite` }}
                      />
                    );
                  })()}
                  {/* Inner column — residential & civic loads */}
                  <g transform="translate(612,58)" className={twinLoadNodeClass('ev', twinOutage.active, twinOutage.loadId, twinDonorId)}><circle r="18" fill="oklch(0.08 0.010 58)" stroke="#d4a044" strokeWidth="1.1" opacity=".65"/><rect x="-7" y="-5" width="14" height="8" rx="2.5" fill="#d4a044" opacity=".4"/><circle cx="-3.5" cy="4.5" r="1.8" fill="#d4a044" opacity=".65"/><circle cx="3.5" cy="4.5" r="1.8" fill="#d4a044" opacity=".65"/><text y="26" textAnchor="middle" fill="#d4a044" fontSize="7" fontWeight="700" opacity=".75">EV HUB</text></g>
                  <g transform="translate(612,118)" className={twinLoadNodeClass('housing', twinOutage.active, twinOutage.loadId, twinDonorId)}><circle r="18" fill="oklch(0.08 0.010 58)" stroke="#94a3b8" strokeWidth="1.1" opacity=".55"/><path d="M-8 4 L0 -8 L8 4 Z" fill="#94a3b8" opacity=".45"/><rect x="-7" y="4" width="14" height="7" rx="1" fill="#94a3b8" opacity=".35"/><text y="28" textAnchor="middle" fill="#cbd5e1" fontSize="7" fontWeight="700" opacity=".75">HOUSING</text></g>
                  <g transform="translate(612,178)" className={twinLoadNodeClass('hospital', twinOutage.active, twinOutage.loadId, twinDonorId)}><circle r="18" fill="oklch(0.08 0.010 58)" stroke="#f87171" strokeWidth="1.1" opacity=".55"/><path d="M0 -9 L3 -3 L0 2 L-3 -3 Z" fill="#f87171" opacity=".5"/><rect x="-8" y="2" width="16" height="8" rx="1.5" fill="#f87171" opacity=".25"/><text y="28" textAnchor="middle" fill="#fecaca" fontSize="7" fontWeight="700" opacity=".75">HOSPITAL</text></g>
                  <g transform="translate(612,238)" className={twinLoadNodeClass('schools', twinOutage.active, twinOutage.loadId, twinDonorId)}><circle r="18" fill="oklch(0.08 0.010 58)" stroke="#60a5fa" strokeWidth="1.1" opacity=".55"/><rect x="-9" y="-6" width="6" height="12" rx="1" fill="#60a5fa" opacity=".35"/><rect x="-1" y="-4" width="6" height="10" rx="1" fill="#60a5fa" opacity=".3"/><rect x="5" y="-5" width="6" height="11" rx="1" fill="#60a5fa" opacity=".28"/><text y="28" textAnchor="middle" fill="#bfdbfe" fontSize="7" fontWeight="700" opacity=".75">SCHOOLS</text></g>
                  <g transform="translate(612,298)" className={twinLoadNodeClass('retail', twinOutage.active, twinOutage.loadId, twinDonorId)}><circle r="18" fill="oklch(0.08 0.010 58)" stroke="#c084fc" strokeWidth="1.1" opacity=".55"/><rect x="-8" y="-4" width="16" height="5" rx="1" fill="#c084fc" opacity=".3"/><line x1="-6" y1="2" x2="6" y2="2" stroke="#c084fc" strokeWidth="1.5" opacity=".5"/><text y="28" textAnchor="middle" fill="#e9d5ff" fontSize="7" fontWeight="700" opacity=".75">RETAIL</text></g>
                  <g transform="translate(612,358)" className={twinLoadNodeClass('data', twinOutage.active, twinOutage.loadId, twinDonorId)}><circle r="18" fill="oklch(0.08 0.010 58)" stroke="#d4a044" strokeWidth="1.1" opacity=".6"/><rect x="-8" y="-9" width="16" height="4.5" rx="1" fill="#d4a044" opacity=".5"/><rect x="-8" y="-2.5" width="16" height="4.5" rx="1" fill="#d4a044" opacity=".35"/><rect x="-8" y="4" width="16" height="4.5" rx="1" fill="#d4a044" opacity=".2"/><text y="28" textAnchor="middle" fill="#d4a044" fontSize="7" fontWeight="700" opacity=".75">DATA CTR</text></g>
                  {/* Outer column — commercial & industrial */}
                  <g transform="translate(722,88)" className={twinLoadNodeClass('offices', twinOutage.active, twinOutage.loadId, twinDonorId)}><circle r="18" fill="oklch(0.08 0.010 58)" stroke="#a78bfa" strokeWidth="1.1" opacity=".55"/><rect x="-9" y="-8" width="18" height="16" rx="1.5" fill="none" stroke="#a78bfa" strokeWidth="1.2" opacity=".45"/><line x1="-4" y1="-3" x2="4" y2="-3" stroke="#a78bfa" strokeWidth="1" opacity=".5"/><line x1="-4" y1="1" x2="4" y2="1" stroke="#a78bfa" strokeWidth="1" opacity=".5"/><text y="28" textAnchor="middle" fill="#ddd6fe" fontSize="7" fontWeight="700" opacity=".75">OFFICES</text></g>
                  <g transform="translate(722,158)" className={twinLoadNodeClass('industry', twinOutage.active, twinOutage.loadId, twinDonorId)}><circle r="18" fill="oklch(0.08 0.010 58)" stroke="#fb923c" strokeWidth="1.1" opacity=".55"/><rect x="-8" y="0" width="6" height="10" rx="1" fill="#fb923c" opacity=".4"/><rect x="-1" y="-3" width="10" height="13" rx="1" fill="#fb923c" opacity=".32"/><text y="28" textAnchor="middle" fill="#fed7aa" fontSize="7" fontWeight="700" opacity=".75">INDUSTRY</text></g>
                  <g transform="translate(722,228)" className={twinLoadNodeClass('civic', twinOutage.active, twinOutage.loadId, twinDonorId)}><circle r="18" fill="oklch(0.08 0.010 58)" stroke="#4ade80" strokeWidth="1.1" opacity=".55"/><rect x="-10" y="-5" width="20" height="6" rx="1" fill="#4ade80" opacity=".35"/><circle cx="-5" cy="5" r="3" fill="#4ade80" opacity=".3"/><circle cx="5" cy="5" r="3" fill="#4ade80" opacity=".3"/><text y="28" textAnchor="middle" fill="#bbf7d0" fontSize="7" fontWeight="700" opacity=".75">CIVIC</text></g>
                  <g transform="translate(722,298)" className={twinLoadNodeClass('warehouse', twinOutage.active, twinOutage.loadId, twinDonorId)}><circle r="18" fill="oklch(0.08 0.010 58)" stroke="#64748b" strokeWidth="1.1" opacity=".55"/><rect x="-10" y="-6" width="20" height="8" rx="1" fill="#64748b" opacity=".4"/><rect x="-6" y="2" width="4" height="5" rx=".5" fill="#94a3b8" opacity=".45"/><rect x="2" y="2" width="4" height="5" rx=".5" fill="#94a3b8" opacity=".45"/><text y="28" textAnchor="middle" fill="#e2e8f0" fontSize="7" fontWeight="700" opacity=".75">WAREHOUSE</text></g>
                  <g transform="translate(722,368)" className={twinLoadNodeClass('district', twinOutage.active, twinOutage.loadId, twinDonorId)}><circle r="18" fill="oklch(0.08 0.010 58)" stroke="#38bdf8" strokeWidth="1.1" opacity=".55"/><rect x="-8" y="-7" width="16" height="5" rx="1" fill="#38bdf8" opacity=".35"/><path d="M-6 0 L0 -6 L6 0" fill="none" stroke="#38bdf8" strokeWidth="1.2" opacity=".5"/><text y="28" textAnchor="middle" fill="#bae6fd" fontSize="7" fontWeight="700" opacity=".75">DISTRICT</text></g>
                </svg>
              </div>
              </GlowFrame>
            </div>
          </div>
        )}

        {/* ══ ANALYTICS ══ */}
        {page === 'analytics' && (
          <div className="pg pg-scroll pg-analytics">
            <LineWaves
              speed={0.3}
              innerLineCount={32}
              outerLineCount={36}
              warpIntensity={1}
              rotation={-45}
              edgeFadeWidth={0}
              colorCycleSpeed={1}
              brightness={0.26}
              color1="#0a1f12"
              color2="#143d24"
              color3="#0f2818"
              fixed
            />
            <div className="pg-inner pg-inner--analytics">
              <div className="sec-header">
                <div className="sec-label">Analytics</div>
                <div className="sec-title">Performance & Forecasting</div>
                <div className="sec-sub">Grid output trends, generation mix, and AI-predicted 24-hour demand</div>
                <div className="sec-desc">Historical supply and demand curves, current generation mix by source, and a 24-hour demand forecast computed by neural models trained on Nova City's load patterns and weather data.</div>
              </div>
              <div className="an-grid">
                <GlowFrame className="border-glow--w100 border-glow--flex">
                  <div className="c fw glow-strip">
                    <div className="c-h">
                      <div className="c-t">Supply vs Demand</div>
                      <div className="an-legend" style={{ display: 'flex', gap: 14, fontSize: 11 }}>
                        <span style={{ color: 'var(--a2)' }}>Supply</span>
                        <span style={{ color: 'var(--red)' }}>Demand</span>
                        <span style={{ color: 'rgba(212,148,46,0.5)' }}>Reserve</span>
                      </div>
                    </div>
                    <div className="ch-h"><canvas ref={anSdEl} id="an-sd" /></div>
                  </div>
                </GlowFrame>
                <GlowFrame className="border-glow--w100 border-glow--flex">
                  <div className="c glow-strip">
                    <div className="c-h">
                      <div className="c-t">Generation Mix</div>
                      <div className="c-t" id="an-total" style={{ color: 'var(--text2)' }}>2,840 MW</div>
                    </div>
                    <div className="ch-m an-mix-wrap">
                      <canvas ref={anMixEl} id="an-mix" className="an-mix-canvas" />
                    </div>
                  </div>
                </GlowFrame>
                <GlowFrame className="border-glow--w100 border-glow--flex">
                  <div className="c glow-strip">
                    <div className="c-h">
                      <div className="c-t">24h Forecast</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--a2)', letterSpacing: '.6px' }}>AI PREDICTED</div>
                    </div>
                    <div className="ch-m"><canvas ref={anFcEl} id="an-fc" /></div>
                  </div>
                </GlowFrame>
              </div>
            </div>
          </div>
        )}

        {/* ══ AI AGENT ══ */}
        {page === 'agent' && (
          <div className="pg pg-scroll">
            <div className="pg-inner">
              <div className="sec-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div className="sec-label">AI Agent</div>
                  <div className="sec-title">Autonomous Operations</div>
                  <div className="sec-sub">Real-time decision log and demand forecasting</div>
                  <div className="sec-desc">Flux's decision engine runs continuously — load shifting, source dispatch, V2G coordination, demand deferral. Every action is logged here as it happens.</div>
                </div>
                <div className="ag-rate-badge">
                  <span className="sb-live" style={{ display: 'inline-block', marginRight: 6 }} />
                  <span id="ag-rate">1,243/hr</span>
                </div>
              </div>

              {/* Key stats row */}
              <div className="ag-stats-row">
                <div className="ag-stat">
                  <div className="ag-stat-l">Decisions Today</div>
                  <div className="ag-stat-v" id="ag-total">14,832</div>
                </div>
                <div className="ag-stat">
                  <div className="ag-stat-l">Renewable Mix</div>
                  <div className="ag-stat-v accent" id="ag-ren">68<span>%</span></div>
                </div>
                <div className="ag-stat">
                  <div className="ag-stat-l">Battery Reserve</div>
                  <div className="ag-stat-v accent" id="ag-bat">78<span>%</span></div>
                </div>
              </div>

              <div className="ag-layout">
                {/* Decision Log */}
                <GlowFrame className="border-glow--w100 border-glow--flex">
                  <div className="c ag-feed-card glow-strip">
                    <div className="c-h">
                      <div className="c-t">Decision Log</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--a2)', letterSpacing: '.6px' }}>LIVE</div>
                    </div>
                    <div className="ag-feed-body">
                      {feed.map(item => (
                        <GlowFrame key={item.id} borderRadius={7} glowRadius={28} glowIntensity={0.65} className="border-glow--w100">
                          <div className={`fi fi-${item.type} glow-strip`}>
                            <div className="fi-hdr">
                              <span className="fi-type">{item.type}</span>
                              <span className="fi-time">{item.time}</span>
                            </div>
                            <div className="fi-text">{item.message}</div>
                          </div>
                        </GlowFrame>
                      ))}
                    </div>
                  </div>
                </GlowFrame>

                {/* Forecast panel */}
                <div className="ag-side">
                  <GlowFrame className="border-glow--w100 border-glow--flex">
                    <div className="c glow-strip">
                      <div className="c-h">
                        <div className="c-t">Load Forecast</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--a2)', letterSpacing: '.6px' }}>NEXT 4h</div>
                      </div>
                      <div className="c-b">
                        {[
                          { id: '1', label: 'Now → +1h',  color: 'var(--green)',  w: '71%',  v: '2.71 GW' },
                          { id: '2', label: '+1h → +2h', color: 'var(--yellow)', w: '82%',  v: '2.89 GW' },
                          { id: '3', label: '+2h → +3h', color: 'var(--red)',    w: '91%',  v: '3.12 GW' },
                          { id: '4', label: '+3h → +4h', color: 'var(--a2)',    w: '85%',  v: '2.95 GW' },
                        ].map(p => (
                          <div key={p.id} className="pred">
                            <div className="pred-h">
                              <span>{p.label}</span>
                              <span style={{ color: p.color }}>{p.v}</span>
                            </div>
                            <div className="pred-t">
                              <div className="pred-f" style={{ width: p.w, background: `linear-gradient(90deg, var(--a3), ${p.color})` }}>{p.w}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </GlowFrame>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ SIMULATION ══ */}
        {page === 'simulation' && (
          <div className="pg pg-scroll pg-simulation">
            <div className="pg-inner pg-inner--simulation">
              <SimulationSection currentTotalDemand={S.current.demand} />
            </div>
          </div>
        )}

      </div>

      {showInfiniteMenu && (
        <div
          className="infinite-menu-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Quick navigation"
        >
          <div className="infinite-menu-overlay-backdrop" />
          <div className="infinite-menu-overlay-panel">
            <InfiniteMenu
              key={ringMenuVersion}
              items={INFINITE_MENU_ITEMS}
              onActiveChange={p => {
                ringPageRef.current = p as Page;
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
