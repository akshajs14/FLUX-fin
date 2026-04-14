import { useCallback, useRef, useState } from 'react';
import './BorderGlow.css';

type BorderGlowProps = {
  children: React.ReactNode;
  edgeSensitivity?: number;
  glowColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  animated?: boolean;
  colors?: string[];
  className?: string;
  /** Applied to the inner content wrapper (e.g. layout, overflow). */
  innerClassName?: string;
  style?: React.CSSProperties;
};

/** `"40 80 80"` → `"40, 80, 80"` for `rgba(var(--glow-rgb), a)`. */
function parseGlowRgb(s: string): string {
  const t = s.trim();
  if (t.includes(',')) return t;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) return `${parts[0]}, ${parts[1]}, ${parts[2]}`;
  return '128, 128, 128';
}

function buildConic(colors: string[], spreadDeg: number): string {
  const list = colors.length ? colors : ['#a855f7', '#ec4899', '#38bdf8'];
  const dup = [...list, list[0]];
  return dup
    .map((c, i) => `${c} ${((i / (dup.length - 1)) * spreadDeg).toFixed(2)}deg`)
    .join(', ');
}

export function BorderGlow({
  children,
  edgeSensitivity = 30,
  glowColor = '128 128 128',
  backgroundColor = '#060010',
  borderRadius = 16,
  glowRadius = 40,
  glowIntensity = 1,
  coneSpread = 25,
  animated = false,
  colors = ['#c084fc', '#f472b6', '#38bdf8'],
  className = '',
  innerClassName = '',
  style,
}: BorderGlowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mx, setMx] = useState(50);
  const [my, setMy] = useState(50);
  const [edge, setEdge] = useState(0);

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * 100;
      const py = ((e.clientY - r.top) / r.height) * 100;
      const dl = e.clientX - r.left;
      const dr = r.right - e.clientX;
      const dt = e.clientY - r.top;
      const db = r.bottom - e.clientY;
      const minD = Math.min(dl, dr, dt, db);
      const prox = Math.max(0, Math.min(1, 1 - minD / Math.max(8, edgeSensitivity)));
      setMx(px);
      setMy(py);
      setEdge(prox * glowIntensity);
    },
    [edgeSensitivity, glowIntensity],
  );

  const onLeave = useCallback(() => {
    setEdge(0);
  }, []);

  const rgb = parseGlowRgb(glowColor);
  const angleDeg = (Math.atan2(my - 50, mx - 50) * 180) / Math.PI;
  const spread = Math.max(30, Math.min(360, coneSpread * 3));
  const conic = buildConic(colors, spread);

  return (
    <div
      ref={rootRef}
      className={`border-glow ${animated ? 'border-glow--animated' : ''} ${className}`.trim()}
      style={
        {
          ...style,
          ['--bg' as string]: backgroundColor,
          ['--r' as string]: `${borderRadius}px`,
          ['--mx' as string]: `${mx}%`,
          ['--my' as string]: `${my}%`,
          ['--edge' as string]: String(edge),
          ['--glow-r' as string]: `${glowRadius}px`,
          ['--glow-rgb' as string]: rgb,
          ['--angle' as string]: `${angleDeg}deg`,
          ['--conic' as string]: conic,
        } as React.CSSProperties
      }
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="border-glow__aura" aria-hidden />
      <div className={`border-glow__inner ${innerClassName}`.trim()}>{children}</div>
    </div>
  );
}
