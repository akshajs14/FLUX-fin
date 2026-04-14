import { useEffect, useRef } from 'react';
import { parseCssColorToRgb, smoothStepDt } from '../lib/colorLerp';
import './Waves.css';

export type WavesProps = {
  lineColor?: string;
  backgroundColor?: string;
  waveSpeedX?: number;
  waveSpeedY?: number;
  waveAmpX?: number;
  waveAmpY?: number;
  friction?: number;
  tension?: number;
  maxCursorMove?: number;
  xGap?: number;
  yGap?: number;
  /** Stroke opacity for grid lines (0–1) */
  lineOpacity?: number;
  /** Cover the full viewport (fixed) — use behind full-page UI */
  fullscreen?: boolean;
  className?: string;
};

type Point = {
  bx: number;
  by: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const DEFAULTS = {
  lineColor: '#00ff62',
  backgroundColor: '#000000',
  waveSpeedX: 0.0125,
  waveSpeedY: 0.01,
  waveAmpX: 40,
  waveAmpY: 20,
  friction: 0.9,
  tension: 0.01,
  maxCursorMove: 120,
  xGap: 12,
  yGap: 36,
  lineOpacity: 0.55,
} as const;

/** Scales user waveSpeed* props into smooth angular motion (reactbits-style). */
const TIME_K = 96;

export function Waves({
  lineColor = DEFAULTS.lineColor,
  backgroundColor = DEFAULTS.backgroundColor,
  waveSpeedX = DEFAULTS.waveSpeedX,
  waveSpeedY = DEFAULTS.waveSpeedY,
  waveAmpX = DEFAULTS.waveAmpX,
  waveAmpY = DEFAULTS.waveAmpY,
  friction = DEFAULTS.friction,
  tension = DEFAULTS.tension,
  maxCursorMove = DEFAULTS.maxCursorMove,
  xGap = DEFAULTS.xGap,
  yGap = DEFAULTS.yGap,
  lineOpacity = DEFAULTS.lineOpacity,
  fullscreen = false,
  className = '',
}: WavesProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<Point[][]>([]);
  const mouseRef = useRef({ x: 0.5, y: 0.5, active: false });
  const targetLineRgbRef = useRef(parseCssColorToRgb(lineColor));
  const targetBgRgbRef = useRef(parseCssColorToRgb(backgroundColor));
  const targetOpacityRef = useRef(lineOpacity);
  const displayLineRgbRef = useRef<[number, number, number] | null>(null);
  const displayBgRgbRef = useRef<[number, number, number] | null>(null);
  const displayOpacityRef = useRef<number | null>(null);
  const lastDrawNowRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const t0Ref = useRef(0);

  targetLineRgbRef.current = parseCssColorToRgb(lineColor);
  targetBgRgbRef.current = parseCssColorToRgb(backgroundColor);
  targetOpacityRef.current = lineOpacity;

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    const params = {
      waveSpeedX,
      waveSpeedY,
      waveAmpX,
      waveAmpY,
      friction,
      tension,
      maxCursorMove,
      xGap,
      yGap,
    };

    const buildGrid = (w: number, h: number) => {
      const gx = Math.max(params.xGap, 8);
      const gy = Math.max(params.yGap, 8);
      const grid: Point[][] = [];
      for (let y = 0; y <= h + gy; y += gy) {
        const row: Point[] = [];
        for (let x = 0; x <= w + gx; x += gx) {
          const bx = Math.min(x, w);
          const by = Math.min(y, h);
          row.push({ bx, by, x: bx, y: by, vx: 0, vy: 0 });
        }
        grid.push(row);
      }
      if (grid.length < 2 || grid[0]!.length < 2) {
        gridRef.current = [
          [
            { bx: 0, by: 0, x: 0, y: 0, vx: 0, vy: 0 },
            { bx: w, by: 0, x: w, y: 0, vx: 0, vy: 0 },
          ],
          [
            { bx: 0, by: h, x: 0, y: h, vx: 0, vy: 0 },
            { bx: w, by: h, x: w, y: h, vx: 0, vy: 0 },
          ],
        ];
        return;
      }
      gridRef.current = grid;
    };

    const setCanvasSize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildGrid(w, h);
    };

    const setPointer = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect();
      const x = (clientX - rect.left) / Math.max(rect.width, 1);
      const y = (clientY - rect.top) / Math.max(rect.height, 1);
      mouseRef.current = {
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
        active: true,
      };
    };

    const onMove = (e: MouseEvent) => {
      setPointer(e.clientX, e.clientY);
    };

    const onTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const t = e.touches[0]!;
      setPointer(t.clientX, t.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const t = e.touches[0]!;
      setPointer(t.clientX, t.clientY);
    };

    const onLeave = () => {
      mouseRef.current.active = false;
    };

    setCanvasSize();
    t0Ref.current = performance.now();

    const ro = new ResizeObserver(() => {
      setCanvasSize();
    });
    ro.observe(host);

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', onLeave);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('touchend', onLeave, { passive: true });
    host.addEventListener('mouseenter', onMove, { passive: true });

    const draw = (now: number) => {
      if (cancelled) return;
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;

      const elapsed = (now - t0Ref.current) * 0.001;
      const grid = gridRef.current;
      const m = mouseRef.current;
      const mx = m.x * cssW;
      const my = m.y * cssH;

      const {
        waveSpeedX: wsx,
        waveSpeedY: wsy,
        waveAmpX: ax,
        waveAmpY: ay,
        friction: fr,
        tension: tn,
        maxCursorMove: inf,
      } = params;

      for (let i = 0; i < grid.length; i++) {
        const row = grid[i]!;
        for (let j = 0; j < row.length; j++) {
          const p = row[j]!;
          const restX =
            p.bx + Math.sin(elapsed * wsx * TIME_K + p.by * 0.018) * ax;
          const restY =
            p.by + Math.cos(elapsed * wsy * TIME_K + p.bx * 0.018) * ay;

          let fx = (restX - p.x) * tn;
          let fy = (restY - p.y) * tn;

          if (m.active) {
            const dx = mx - p.x;
            const dy = my - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist < inf && dist > 0.5) {
              const strength = (1 - dist / inf) * 0.42;
              fx += (dx / dist) * strength;
              fy += (dy / dist) * strength;
            }
          }

          p.vx = (p.vx + fx) * fr;
          p.vy = (p.vy + fy) * fr;
          p.x += p.vx;
          p.y += p.vy;
        }
      }

      const dt =
        lastDrawNowRef.current === null
          ? 0.016
          : Math.min(0.12, (now - lastDrawNowRef.current) * 0.001);
      lastDrawNowRef.current = now;
      const blend = smoothStepDt(dt, 4.8);

      const tl = targetLineRgbRef.current;
      const tb = targetBgRgbRef.current;
      const to = targetOpacityRef.current;

      if (displayLineRgbRef.current === null) {
        displayLineRgbRef.current = [tl[0], tl[1], tl[2]];
        displayBgRgbRef.current = [tb[0], tb[1], tb[2]];
        displayOpacityRef.current = to;
      } else {
        const dl = displayLineRgbRef.current;
        const db = displayBgRgbRef.current!;
        let dop = displayOpacityRef.current!;
        dl[0] += (tl[0] - dl[0]) * blend;
        dl[1] += (tl[1] - dl[1]) * blend;
        dl[2] += (tl[2] - dl[2]) * blend;
        db[0] += (tb[0] - db[0]) * blend;
        db[1] += (tb[1] - db[1]) * blend;
        db[2] += (tb[2] - db[2]) * blend;
        dop += (to - dop) * blend;
        displayOpacityRef.current = dop;
      }

      const dl = displayLineRgbRef.current!;
      const db = displayBgRgbRef.current!;
      const rgb = (c: [number, number, number]) =>
        `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = rgb(db);
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.strokeStyle = rgb(dl);
      ctx.globalAlpha = displayOpacityRef.current!;
      ctx.lineWidth = Math.max(0.6, 1 / dpr);
      ctx.lineJoin = 'round';

      for (let i = 0; i < grid.length; i++) {
        const row = grid[i]!;
        for (let j = 0; j < row.length; j++) {
          const p = row[j]!;
          if (j < row.length - 1) {
            const q = row[j + 1]!;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
          if (i < grid.length - 1) {
            const q = grid[i + 1]![j]!;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha = 1;
      if (!cancelled) rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('touchend', onLeave);
      host.removeEventListener('mouseenter', onMove);
    };
  }, [
    waveSpeedX,
    waveSpeedY,
    waveAmpX,
    waveAmpY,
    friction,
    tension,
    maxCursorMove,
    xGap,
    yGap,
  ]);

  return (
    <div
      ref={hostRef}
      className={`waves${fullscreen ? ' waves--fullscreen' : ''} ${className}`.trim()}
      aria-hidden
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
