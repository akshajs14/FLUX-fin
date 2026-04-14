import { useEffect, useRef } from 'react';
import { hexToRgb, smoothStepDt } from '../lib/colorLerp';
import './Aurora.css';

/**
 * Northern-lights style backdrop: tall soft bands from the top, status-driven colors.
 * Motion is slow time-based drift (not pointer-driven).
 * Color stops ease toward new targets (no hard cuts when status changes).
 */

type AuroraProps = {
  colorStops: string[];
  blend?: number;
  amplitude?: number;
  speed?: number;
  className?: string;
};

const DEFAULT_STOPS = ['#fcff66', '#a3f0b0', '#ffe229'];

export function Aurora({
  colorStops,
  blend = 0.5,
  amplitude = 1,
  speed = 1,
  className = '',
}: AuroraProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const targetColorsRef = useRef<[number, number, number][]>([]);
  const currentColorsRef = useRef<[number, number, number][]>([]);
  const lastNowRef = useRef<number | null>(null);

  targetColorsRef.current = (colorStops.length ? colorStops : DEFAULT_STOPS).map(hexToRgb);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      const { width, height } = host.getBoundingClientRect();
      const w = Math.max(1, Math.floor(width * dpr));
      const h = Math.max(1, Math.floor(height * dpr));
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let cancelled = false;

    const draw = (now: number) => {
      if (cancelled) return;
      const w = canvas.width;
      const h = canvas.height;
      const t = now * 0.001 * speed;
      const tgt = targetColorsRef.current;
      let cur = currentColorsRef.current;
      if (cur.length !== tgt.length) {
        currentColorsRef.current = tgt.map(([r, g, b]) => [r, g, b] as [number, number, number]);
        cur = currentColorsRef.current;
      } else if (tgt.length > 0) {
        const dt =
          lastNowRef.current === null
            ? 0.016
            : Math.min(0.12, (now - lastNowRef.current) * 0.001);
        lastNowRef.current = now;
        const a = smoothStepDt(dt, 4.8);
        for (let i = 0; i < tgt.length; i++) {
          cur[i][0] += (tgt[i][0] - cur[i][0]) * a;
          cur[i][1] += (tgt[i][1] - cur[i][1]) * a;
          cur[i][2] += (tgt[i][2] - cur[i][2]) * a;
        }
      }
      const cols = cur;
      const amp = Math.max(0.35, amplitude);
      const B = blend;

      if (cols.length === 0) {
        if (!cancelled) rafRef.current = requestAnimationFrame(draw);
        return;
      }

      /* ── Deep midnight base (reference: ~#050505) ── */
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#030306';
      ctx.fillRect(0, 0, w, h);
      const baseTint = ctx.createLinearGradient(0, 0, 0, h * 0.55);
      baseTint.addColorStop(0, 'rgba(12, 10, 28, 0.35)');
      baseTint.addColorStop(0.45, 'rgba(5, 5, 12, 0.08)');
      baseTint.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = baseTint;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'screen';

      const nBands = 6;
      for (let i = 0; i < nBands; i++) {
        const [r, g, b] = cols[i % cols.length];
        const phase = i * 1.23;
        const slow = t * 0.22;
        const sway = Math.sin(slow + phase) * 0.11 * amp + Math.sin(t * 0.11 + phase * 0.5) * 0.06 * amp;
        const cx = w * (0.08 + ((i + 0.4) / nBands) * 0.84) + sway * w;
        const cy = -h * (0.08 + (i % 3) * 0.04);
        const radius = h * (0.95 + 0.12 * Math.sin(t * 0.15 + phase)) * (0.92 + i * 0.02);

        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        const aCore = 0.42 * B;
        const aMid = 0.16 * B;
        const aTail = 0.04 * B;
        grd.addColorStop(0, `rgba(${r},${g},${b},${aCore})`);
        grd.addColorStop(0.18, `rgba(${r},${g},${b},${aMid})`);
        grd.addColorStop(0.42, `rgba(${r},${g},${b},${aTail})`);
        grd.addColorStop(0.68, `rgba(${r},${g},${b},${aTail * 0.35})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
      }

      /* Wider, softer “ribbon” — horizontal stretch for curtain feel */
      for (let j = 0; j < 3; j++) {
        const [r, g, b] = cols[(j + 1) % cols.length];
        ctx.save();
        const cx = w * (0.25 + j * 0.25) + Math.sin(t * 0.18 + j * 2) * w * 0.1 * amp;
        const cy = -h * 0.05;
        ctx.translate(cx, cy);
        ctx.scale(2.4 + 0.2 * Math.sin(t * 0.14 + j), 1);
        ctx.translate(-cx, -cy);
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.72);
        const ar = 0.22 * B;
        rg.addColorStop(0, `rgba(${r},${g},${b},${ar})`);
        rg.addColorStop(0.35, `rgba(${r},${g},${b},${ar * 0.45})`);
        rg.addColorStop(0.7, `rgba(${r},${g},${b},${ar * 0.12})`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(-w, -h, 3 * w, 3 * h);
        ctx.restore();
      }

      /* Top wash — extra lime / gold haze like reference highlights */
      const [r0, g0, b0] = cols[0];
      const [r1, g1, b1] = cols[Math.min(1, cols.length - 1)];
      const wash = ctx.createLinearGradient(0, 0, 0, h * 0.72);
      wash.addColorStop(0, `rgba(${r0},${g0},${b0},${0.12 * B})`);
      wash.addColorStop(0.35, `rgba(${r1},${g1},${b1},${0.06 * B})`);
      wash.addColorStop(0.65, `rgba(${r0},${g0},${b0},${0.02 * B})`);
      wash.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'source-over';
      /* Bottom vignette — UI reads on darker lower third */
      const vig = ctx.createLinearGradient(0, h * 0.35, 0, h);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(0.5, 'rgba(0,0,0,0.22)');
      vig.addColorStop(1, 'rgba(0,0,0,0.58)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      if (!cancelled) rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [blend, amplitude, speed]);

  return (
    <div ref={hostRef} className={`aurora ${className}`.trim()} aria-hidden>
      <div className="aurora-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
