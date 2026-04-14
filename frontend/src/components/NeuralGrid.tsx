import { useEffect, useRef } from 'react';
import './NeuralGrid.css';

export type NeuralGridMode = 'neutral' | 'testing' | 'ok' | 'overload';

type NeuralGridProps = {
  mode: NeuralGridMode;
  className?: string;
};

/** Line / node tint per Live AI phase */
const PALETTE: Record<
  NeuralGridMode,
  { line: [number, number, number]; node: [number, number, number]; accent: [number, number, number] }
> = {
  neutral: { line: [59, 130, 246], node: [147, 197, 253], accent: [96, 165, 250] },
  testing: { line: [234, 179, 8], node: [253, 224, 71], accent: [250, 204, 21] },
  ok: { line: [34, 197, 94], node: [134, 239, 172], accent: [74, 222, 128] },
  overload: { line: [220, 38, 38], node: [252, 165, 165], accent: [248, 113, 113] },
};

interface Particle {
  bx: number;
  by: number;
  phase: number;
  speed: number;
}

export function NeuralGrid({ mode, className = '' }: NeuralGridProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5, active: false });
  const pulseRef = useRef({ x: 0.5, y: 0.5, t: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const modeRef = useRef(mode);
  const rafRef = useRef(0);
  modeRef.current = mode;

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const initParticles = (w: number, h: number) => {
      const area = w * h;
      const n = Math.min(96, Math.max(36, Math.floor(area / 22000)));
      const list: Particle[] = [];
      for (let i = 0; i < n; i++) {
        list.push({
          bx: Math.random() * w,
          by: Math.random() * h,
          phase: Math.random() * Math.PI * 2,
          speed: 0.35 + Math.random() * 0.45,
        });
      }
      particlesRef.current = list;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      const { width, height } = host.getBoundingClientRect();
      const w = Math.max(1, Math.floor(width * dpr));
      const h = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        initParticles(w, h);
      }
    };

    const onMove = (e: MouseEvent) => {
      const r = host.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      mouseRef.current = {
        x: (e.clientX - r.left) / r.width,
        y: (e.clientY - r.top) / r.height,
        active: true,
      };
    };

    const onLeave = () => {
      mouseRef.current.active = false;
    };

    const onClick = (e: MouseEvent) => {
      const r = host.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      if (
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      ) {
        pulseRef.current = {
          x: (e.clientX - r.left) / r.width,
          y: (e.clientY - r.top) / r.height,
          t: 1,
        };
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', onLeave);
    window.addEventListener('click', onClick);

    let cancelled = false;
    let t0 = performance.now();

    const draw = (now: number) => {
      if (cancelled) return;
      const w = canvas.width;
      const h = canvas.height;
      const t = (now - t0) * 0.001;
      const m = modeRef.current;
      const pal = PALETTE[m];
      const [lr, lg, lb] = pal.line;
      const [nr, ng, nb] = pal.node;
      const [ar, ag, ab] = pal.accent;

      const particles = particlesRef.current;
      const linkDist = Math.min(w, h) * 0.11;
      const linkDist2 = linkDist * linkDist;

      const pts = particles.map(p => {
        const ox = Math.sin(t * p.speed * 0.45 + p.phase) * (w * 0.012);
        const oy = Math.cos(t * p.speed * 0.38 + p.phase * 1.1) * (h * 0.01);
        return { x: p.bx + ox, y: p.by + oy };
      });

      ctx.fillStyle = 'transparent';
      ctx.clearRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 1 * (w / 1200);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < linkDist2) {
            const alpha = (1 - Math.sqrt(d2) / linkDist) * 0.22;
            ctx.strokeStyle = `rgba(${lr},${lg},${lb},${alpha})`;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }

      const mx = mouseRef.current.x * w;
      const my = mouseRef.current.y * h;
      const hoverR = Math.min(w, h) * 0.14;

      for (let i = 0; i < pts.length; i++) {
        const { x, y } = pts[i];
        let boost = 0;
        if (mouseRef.current.active) {
          const d = Math.hypot(x - mx, y - my);
          if (d < hoverR) boost = (1 - d / hoverR) * 0.85;
        }
        const pr = pulseRef.current;
        if (pr.t > 0.01) {
          const px = pr.x * w;
          const py = pr.y * h;
          const d2 = Math.hypot(x - px, y - py);
          const prR = Math.min(w, h) * 0.2;
          if (d2 < prR) boost = Math.max(boost, pr.t * (1 - d2 / prR) * 0.9);
        }
        const a = 0.14 + boost * 0.55;
        const r = 1.2 + boost * 2.8;
        ctx.fillStyle = `rgba(${nr},${ng},${nb},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (boost > 0.15) {
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},${boost * 0.45})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, r + 3 + boost * 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (pulseRef.current.t > 0) {
        pulseRef.current.t *= 0.92;
        if (pulseRef.current.t < 0.02) pulseRef.current.t = 0;
      }

      ctx.globalCompositeOperation = 'source-over';
      if (!cancelled) rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <div ref={hostRef} className={`neural-grid ${className}`.trim()} aria-hidden>
      <canvas ref={canvasRef} />
    </div>
  );
}
