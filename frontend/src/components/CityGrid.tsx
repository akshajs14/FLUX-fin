import { useCallback, useEffect, useRef } from 'react';
import type { CityData, StressMode, StressPoint } from '../types';

interface CityGridProps {
  city: CityData;
  stressPoints: StressPoint[];
  onAddStress?: (pt: StressPoint) => void;
  isAiSide: boolean;
  mode: StressMode;
  intensity: number;
  brushSize: number;
  isPaused: boolean;
}

// Node status colors
const STATUS_COLORS = {
  normal: { r: 120, g: 155, b: 210 },    // muted blue
  stressed: { r: 200, g: 145, b: 55 },   // muted amber
  critical: { r: 200, g: 70, b: 70 },    // muted red
  offline: { r: 45, g: 50, b: 62 },      // dark gray
  recovering: { r: 55, g: 170, b: 105 }, // muted green
};

const MODE_COLORS: Record<StressMode, { r: number; g: number; b: number }> = {
  surge: { r: 205, g: 125, b: 45 },
  outage: { r: 35, g: 35, b: 50 },
  instability: { r: 150, g: 95, b: 200 },
  renewable: { r: 55, g: 170, b: 105 },
};

function getNodeStress(
  nx: number,
  ny: number,
  stressPoints: StressPoint[],
  canvasW: number,
  canvasH: number
): { totalStress: number; dominantMode: StressMode } {
  let totalStress = 0;
  let dominantMode: StressMode = 'surge';
  let maxContrib = 0;

  for (const sp of stressPoints) {
    const dx = nx - sp.x * canvasW;
    const dy = ny - sp.y * canvasH;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const r = sp.radius * canvasW;
    if (dist < r) {
      const contrib = sp.intensity * (1 - dist / r);
      totalStress += contrib;
      if (contrib > maxContrib) {
        maxContrib = contrib;
        dominantMode = sp.mode;
      }
    }
  }

  return { totalStress: Math.min(totalStress, 1), dominantMode };
}

export function CityGrid({
  city,
  stressPoints,
  onAddStress,
  isAiSide,
  mode,
  intensity,
  brushSize,
  isPaused,
}: CityGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const drawingRef = useRef(false);
  const timeRef = useRef(0);

  const handlePointerEvent = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!onAddStress || isAiSide) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      if (e.type === 'pointerdown') {
        drawingRef.current = true;
        canvas.setPointerCapture(e.pointerId);
      }

      if (drawingRef.current && (e.type === 'pointermove' || e.type === 'pointerdown')) {
        onAddStress({
          x,
          y,
          intensity: intensity * 0.15,
          radius: brushSize * 0.08,
          mode,
          time: Date.now(),
        });
      }

      if (e.type === 'pointerup' || e.type === 'pointerleave') {
        drawingRef.current = false;
      }
    },
    [onAddStress, isAiSide, mode, intensity, brushSize]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    function draw() {
      if (!isPaused) timeRef.current += 0.016;
      const t = timeRef.current;
      const rect = canvas!.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // Clear
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = 'rgba(10, 13, 18, 0.98)';
      ctx.fillRect(0, 0, w, h);

      // Subtle dot grid
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      const gridSpacing = 30;
      for (let gx = 0; gx < w; gx += gridSpacing) {
        for (let gy = 0; gy < h; gy += gridSpacing) {
          ctx.fillRect(gx, gy, 1, 1);
        }
      }

      // Draw stress heatmap overlay
      for (const sp of stressPoints) {
        const sx = sp.x * w;
        const sy = sp.y * h;
        const sr = sp.radius * w;
        const mc = MODE_COLORS[sp.mode];

        if (isAiSide) {
          // AI side: dampened stress, show containment
          const dampedIntensity = sp.intensity * 0.25;
          const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 0.6);
          gradient.addColorStop(0, `rgba(${mc.r}, ${mc.g}, ${mc.b}, ${dampedIntensity * 0.3})`);
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);

          // Recovery ring
          const ringPhase = (t * 2 + sp.x * 10) % 1;
          ctx.strokeStyle = `rgba(55, 170, 105, ${0.3 * (1 - ringPhase)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, sr * ringPhase * 0.8, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Raw side: full stress visualization
          const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
          gradient.addColorStop(0, `rgba(${mc.r}, ${mc.g}, ${mc.b}, ${sp.intensity * 0.5})`);
          gradient.addColorStop(0.6, `rgba(${mc.r}, ${mc.g}, ${mc.b}, ${sp.intensity * 0.15})`);
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
        }
      }

      // Draw edges
      for (const edge of city.edges) {
        const nA = city.nodes[edge.from];
        const nB = city.nodes[edge.to];
        if (!nA || !nB) continue;

        const ax = nA.x * w;
        const ay = nA.y * h;
        const bx = nB.x * w;
        const by = nB.y * h;

        const midX = (ax + bx) / 2;
        const midY = (ay + by) / 2;

        const { totalStress: stressA } = getNodeStress(ax, ay, stressPoints, w, h);
        const { totalStress: stressB } = getNodeStress(bx, by, stressPoints, w, h);
        const edgeStress = (stressA + stressB) / 2;

        if (isAiSide) {
          // AI: smooth, optimized flow
          const flowAlpha = 0.2 + (1 - edgeStress * 0.5) * 0.3;
          ctx.strokeStyle = `rgba(120, 155, 210, ${flowAlpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();

          // Animated flow dots
          const edgeLen = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
          const dotCount = Math.floor(edgeLen / 25);
          for (let d = 0; d < dotCount; d++) {
            const progress = ((t * 0.8 + d / dotCount + edge.from * 0.1) % 1);
            const dx = ax + (bx - ax) * progress;
            const dy = ay + (by - ay) * progress;
            ctx.fillStyle = `rgba(120, 155, 210, ${0.6 * (1 - edgeStress * 0.4)})`;
            ctx.beginPath();
            ctx.arc(dx, dy, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // Raw: stressed, chaotic
          const stressColor = edgeStress > 0.5
            ? `rgba(248, 113, 113, ${0.15 + edgeStress * 0.4})`
            : `rgba(100, 120, 150, ${0.15 + (1 - edgeStress) * 0.15})`;
          ctx.strokeStyle = stressColor;
          ctx.lineWidth = edgeStress > 0.5 ? 2 : 1;

          // Jitter for instability
          const jitter = edgeStress > 0.3 ? Math.sin(t * 15 + edge.from) * edgeStress * 3 : 0;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.quadraticCurveTo(midX + jitter, midY + jitter, bx, by);
          ctx.stroke();
        }
      }

      // Draw nodes
      for (const node of city.nodes) {
        const nx = node.x * w;
        const ny = node.y * h;
        const { totalStress, dominantMode } = getNodeStress(nx, ny, stressPoints, w, h);

        let color: { r: number; g: number; b: number };
        let nodeAlpha = 0.9;
        let nodeSize = node.type === 'generator' || node.type === 'substation' ? 7 : 5;

        if (isAiSide) {
          // AI side: nodes recover
          const recoveredStress = totalStress * 0.3;
          if (recoveredStress > 0.6) {
            color = STATUS_COLORS.stressed;
          } else if (recoveredStress > 0.1) {
            color = STATUS_COLORS.recovering;
          } else {
            color = STATUS_COLORS.normal;
          }
          // Pulse effect for recovering nodes
          if (totalStress > 0.2) {
            nodeSize += Math.sin(t * 3) * 1.5;
          }
        } else {
          // Raw side: show full stress
          if (dominantMode === 'outage' && totalStress > 0.5) {
            color = STATUS_COLORS.offline;
            nodeAlpha = 0.3 + Math.random() * 0.2;
            nodeSize *= 0.7;
          } else if (totalStress > 0.6) {
            color = STATUS_COLORS.critical;
            // Flicker effect
            nodeAlpha = 0.5 + Math.random() * 0.5;
          } else if (totalStress > 0.3) {
            color = STATUS_COLORS.stressed;
          } else {
            color = STATUS_COLORS.normal;
          }
        }

        // Glow
        const glowSize = nodeSize * 3;
        const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, glowSize);
        glow.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${nodeAlpha * 0.4})`);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(nx, ny, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${nodeAlpha})`;
        ctx.beginPath();
        ctx.arc(nx, ny, nodeSize, 0, Math.PI * 2);
        ctx.fill();

        // Ring for substations/generators
        if (node.type === 'substation' || node.type === 'generator') {
          ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${nodeAlpha * 0.5})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(nx, ny, nodeSize + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // AI side: draw rerouting paths when stress exists
      if (isAiSide && stressPoints.length > 0) {
        ctx.strokeStyle = 'rgba(100, 155, 210, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);

        // Draw adaptive rerouting lines between safe nodes
        const safeNodes = city.nodes.filter((n) => {
          const { totalStress } = getNodeStress(n.x * w, n.y * h, stressPoints, w, h);
          return totalStress < 0.3;
        });

        for (let i = 0; i < Math.min(safeNodes.length - 1, 6); i++) {
          const a = safeNodes[i];
          const b = safeNodes[(i + 1) % safeNodes.length];
          const ax = a.x * w;
          const ay = a.y * h;
          const bx = b.x * w;
          const by = b.y * h;
          const dist = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);

          if (dist < w * 0.4) {
            const dashOffset = -t * 30;
            ctx.lineDashOffset = dashOffset;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
        }

        ctx.setLineDash([]);
      }

      // Cursor glow for drawing side
      if (!isAiSide && drawingRef.current) {
        const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, brushSize * w * 0.08);
        const mc = MODE_COLORS[mode];
        gradient.addColorStop(0, `rgba(${mc.r}, ${mc.g}, ${mc.b}, 0.15)`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      observer.disconnect();
    };
  }, [city, stressPoints, isAiSide, mode, brushSize, isPaused, intensity]);

  const cursorStyle = !isAiSide && onAddStress
    ? `radial-gradient(circle ${brushSize * 3}px, ${
        mode === 'surge' ? 'rgba(205,125,45,0.3)' :
        mode === 'outage' ? 'rgba(35,35,50,0.4)' :
        mode === 'instability' ? 'rgba(150,95,200,0.3)' :
        'rgba(55,170,105,0.3)'
      } 0%, transparent 70%) ${brushSize * 3} ${brushSize * 3}, crosshair`
    : 'default';

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: cursorStyle,
        borderRadius: '12px',
      }}
      onPointerDown={handlePointerEvent}
      onPointerMove={handlePointerEvent}
      onPointerUp={handlePointerEvent}
      onPointerLeave={handlePointerEvent}
    />
  );
}
