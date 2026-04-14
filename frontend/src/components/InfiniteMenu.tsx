import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface InfiniteMenuItem {
  image: string;
  title: string;
  description: string;
  page: string;
}

type InfiniteMenuProps = {
  items: InfiniteMenuItem[];
  onActiveChange: (page: string) => void;
};

const TWO_PI = Math.PI * 2;

/** Visual size (px) — keep in sync with `.ring-menu-orb` width/height in CSS. */
export const RING_ORB_PX = 228;
const ORB_R = RING_ORB_PX / 2;

/** Ring radius: pentagon chord ≥ orb diameter so adjacent orbs don’t overlap. */
function ringRadius(n: number): number {
  return (ORB_R * 1.08) / Math.sin(Math.PI / n);
}

/** Item i sits at φᵢ = i·2π/n on the ring; orbit is rotated by `rot`. Who is at the bottom (π)? */
function activeIndex(rot: number, n: number): number {
  const target = Math.PI;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const φ = (i * TWO_PI) / n;
    let w = φ - rot;
    w = ((w % TWO_PI) + TWO_PI) % TWO_PI;
    const d = Math.min(Math.abs(w - target), TWO_PI - Math.abs(w - target));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Angular distance from bottom (π) for styling. */
function focusAmount(rot: number, i: number, n: number): number {
  const φ = (i * TWO_PI) / n;
  let w = φ - rot;
  w = ((w % TWO_PI) + TWO_PI) % TWO_PI;
  const d = Math.min(Math.abs(w - Math.PI), TWO_PI - Math.abs(w - Math.PI));
  const step = TWO_PI / n;
  return 1 - Math.min(1, d / (step * 0.55));
}

export function InfiniteMenu({ items, onActiveChange }: InfiniteMenuProps) {
  const n = Math.max(1, items.length);
  const rotationRef = useRef(Math.PI);
  /** Target angle (radians) — updated by ← / → keys, smoothed in rAF. */
  const targetRotationRef = useRef(Math.PI);
  const viewportRef = useRef<HTMLDivElement>(null);
  const vpSizeRef = useRef({ w: 400, h: 400 });
  const lastActiveRef = useRef(-1);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  const [, setTick] = useState(0);
  const rafRef = useRef(0);

  const sync = useCallback(() => setTick(t => t + 1), []);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      vpSizeRef.current = { w: r.width, h: r.height };
      sync();
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    vpSizeRef.current = { w: r.width, h: r.height };
    return () => ro.disconnect();
  }, [sync]);

  useEffect(() => {
    viewportRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const step = TWO_PI / n;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      if (e.key === 'ArrowRight') targetRotationRef.current += step;
      else targetRotationRef.current -= step;
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [n]);

  useEffect(() => {
    const tick = () => {
      const targetRot = targetRotationRef.current;
      const cur = rotationRef.current;
      rotationRef.current += (targetRot - cur) * 0.16;

      const idx = activeIndex(rotationRef.current, n);
      if (idx !== lastActiveRef.current) {
        lastActiveRef.current = idx;
        onActiveChangeRef.current(items[idx].page);
      }

      sync();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [items, n, sync]);

  const R = ringRadius(n);
  const rot = rotationRef.current;
  const active = activeIndex(rot, n);
  const activeItem = items[active];
  const rotDeg = (-rot * 180) / Math.PI;

  return (
    <div className="infinite-menu-root">
      <div className="infinite-menu-viewport">
        <div
          ref={viewportRef}
          className="infinite-menu-clip"
          tabIndex={-1}
          role="listbox"
          aria-label="Ring navigation. Use left and right arrow keys to rotate."
        >
          <div className="ring-menu-stage">
            <div
              className="ring-menu-orbit"
              style={{ transform: `rotate(${rotDeg}deg)` }}
            >
              {items.map((item, i) => {
                const φ = (i * TWO_PI) / n;
                const x = R * Math.sin(φ);
                const y = -R * Math.cos(φ);
                const focus = focusAmount(rot, i, n);
                const scale = 0.68 + 0.32 * focus;
                const opacity = 0.4 + 0.6 * focus;
                const z = Math.round(50 + focus * 150);
                return (
                  <div
                    key={item.page}
                    className="ring-menu-slot"
                    style={{
                      transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`,
                      opacity,
                      zIndex: z,
                    }}
                  >
                    <div className={`ring-menu-orb ${i === active ? 'ring-menu-orb--active' : ''}`}>
                      <img src={item.image} alt="" draggable={false} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="ring-menu-picker" aria-hidden />
          </div>
        </div>

        <div className="ring-menu-popup">
          <div className="ring-menu-popup-title">{activeItem.title}</div>
          <div className="ring-menu-popup-desc">{activeItem.description}</div>
          <p className="ring-menu-popup-hint">← → rotate · release Shift to open</p>
        </div>
      </div>
    </div>
  );
}
