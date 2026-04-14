import { useCallback, useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';

/** 4×4 Bayer matrix for ordered dither (0–15). */
const BAYER4: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function hash2(ix: number, iy: number): number {
  let n = ix * 374761393 + iy * 668265263;
  n = ((n ^ (n >> 13)) * 1274126177) >>> 0;
  return n / 4294967296;
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);
  const n00 = hash2(x0, y0);
  const n10 = hash2(x0 + 1, y0);
  const n01 = hash2(x0, y0 + 1);
  const n11 = hash2(x0 + 1, y0 + 1);
  const nx0 = n00 + fx * (n10 - n00);
  const nx1 = n01 + fx * (n11 - n01);
  return nx0 + fy * (nx1 - nx0);
}

/** Fractal Brownian motion — soft, map-like blobs that drift over time. */
function fbm2(x: number, y: number, time: number): number {
  let sum = 0;
  let amp = 0.55;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 5; o++) {
    const tx = time * 0.11;
    const ty = time * 0.08;
    sum += amp * valueNoise(x * freq + tx, y * freq - ty);
    norm += amp;
    amp *= 0.52;
    freq *= 2.08;
  }
  return sum / norm;
}

/** Four warm stops: near-black → ember → gold → pale (reads like reference stills). */
function warmPalette(cr: number, cg: number, cb: number): [number, number, number][] {
  return [
    [0.025, 0.018, 0.014],
    [cr * 0.38, cg * 0.3, cb * 0.18],
    [cr * 0.78, cg * 0.58, cb * 0.28],
    [
      Math.min(1, cr * 1.08 + 0.18),
      Math.min(1, cg * 1.02 + 0.14),
      Math.min(1, cb * 0.72 + 0.28),
    ],
  ];
}

export type WaveDitherProps = {
  waveColor?: [number, number, number];
  disableAnimation?: boolean;
  enableMouseInteraction?: boolean;
  mouseRadius?: number;
  colorNum?: number;
  pixelSize?: number;
  waveAmplitude?: number;
  waveFrequency?: number;
  waveSpeed?: number;
  className?: string;
  style?: CSSProperties;
};

/**
 * Organic FBM field + Bayer dither — full-screen animated background (no extra libs).
 */
export function WaveDither({
  waveColor = [0.73, 0.49, 0.21],
  disableAnimation = false,
  enableMouseInteraction = false,
  mouseRadius = 0,
  colorNum = 4,
  pixelSize = 2,
  waveAmplitude = 0.3,
  waveFrequency = 3,
  waveSpeed = 0.05,
  className,
  style,
}: WaveDitherProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: -1e6, y: -1e6, active: false });
  const timeRef = useRef(0);
  const rafRef = useRef<number>(0);

  const drawFrame = useCallback(
    (tSec: number) => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;

      const wCss = Math.max(1, wrap.clientWidth || 1080);
      const hCss = Math.max(1, wrap.clientHeight || 1080);
      const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

      let cell = Math.max(1, pixelSize);
      let gw = Math.max(1, Math.floor(wCss / cell));
      let gh = Math.max(1, Math.floor(hCss / cell));
      const maxGw = 400;
      if (gw > maxGw) {
        cell = wCss / maxGw;
        gw = maxGw;
        gh = Math.max(1, Math.floor(hCss / cell));
      }

      const bw = Math.floor(wCss * dpr);
      const bh = Math.floor(hCss * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      canvas.style.width = `${wCss}px`;
      canvas.style.height = `${hCss}px`;

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      const img = ctx.createImageData(gw, gh);
      const data = img.data;

      const [cr, cg, cb] = waveColor;
      const palette = warmPalette(cr, cg, cb);
      const levels = Math.max(2, Math.min(16, Math.round(colorNum)));
      const freqScale = 2.2 + waveFrequency * 0.45;
      const timeScale = tSec * waveSpeed * 2.8;
      const contrast = 0.65 + waveAmplitude * 0.9;
      const m = mouseRef.current;
      const mx = m.active ? m.x : -1e6;
      const my = m.active ? m.y : -1e6;
      const mRad = mouseRadius <= 0 ? 200 : mouseRadius;

      for (let j = 0; j < gh; j++) {
        const v = j / Math.max(1, gh - 1);
        for (let i = 0; i < gw; i++) {
          const u = i / Math.max(1, gw - 1);

          const wx = u * freqScale * 14 + timeScale * 0.55;
          const wy = v * freqScale * 14 - timeScale * 0.38;
          let n = fbm2(wx, wy, timeScale);

          n += 0.12 * Math.sin(u * Math.PI * 3 + timeScale * 0.4) * Math.cos(v * Math.PI * 2.5 - timeScale * 0.3);

          if (enableMouseInteraction && m.active) {
            const px = (i + 0.5) * cell;
            const py = (j + 0.5) * cell;
            const dx = px - mx;
            const dy = py - my;
            const dist = Math.hypot(dx, dy);
            const falloff = Math.exp(-(dist * dist) / (mRad * mRad));
            n += falloff * 0.22 * Math.sin(dist * 0.025 - tSec * 2.5);
          }

          n = Math.max(0, Math.min(1, n));
          n = Math.pow(n, contrast);

          const bi = BAYER4[j % 4][i % 4];
          const bayer = (bi + 0.5) / 16 - 0.5;
          const scaled = n * (levels - 1) + bayer * 1.05;
          const idx = Math.max(0, Math.min(levels - 1, Math.round(scaled)));
          const [pr, pg, pb] = palette[Math.min(idx, palette.length - 1)];

          const o = (j * gw + i) * 4;
          data[o] = Math.round(pr * 255);
          data[o + 1] = Math.round(pg * 255);
          data[o + 2] = Math.round(pb * 255);
          data[o + 3] = 255;
        }
      }

      const tmp = document.createElement('canvas');
      tmp.width = gw;
      tmp.height = gh;
      const tctx = tmp.getContext('2d');
      if (!tctx) return;
      tctx.putImageData(img, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, bw, bh);
      ctx.drawImage(tmp, 0, 0, gw, gh, 0, 0, bw, bh);
    },
    [
      waveColor,
      enableMouseInteraction,
      mouseRadius,
      colorNum,
      pixelSize,
      waveAmplitude,
      waveFrequency,
      waveSpeed,
    ],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let mounted = true;

    const tick = (now: number) => {
      if (!mounted) return;
      const tSec = now * 0.001;
      timeRef.current = tSec;
      drawFrame(disableAnimation ? 0 : tSec);
      if (!disableAnimation) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    if (disableAnimation) {
      drawFrame(0);
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }

    const ro = new ResizeObserver(() => {
      drawFrame(disableAnimation ? 0 : timeRef.current);
    });
    ro.observe(wrap);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [disableAnimation, drawFrame]);

  const onMove = (e: MouseEvent) => {
    if (!enableMouseInteraction || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    mouseRef.current = {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      active: true,
    };
    drawFrame(disableAnimation ? 0 : timeRef.current);
  };

  const onLeave = () => {
    mouseRef.current.active = false;
  };

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        ...style,
      }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
