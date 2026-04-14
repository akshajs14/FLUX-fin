import { useCallback, useEffect, useRef, useState } from 'react';

type TiltedOrbProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** When true (e.g. global pan drag), local tilt is disabled. */
  disabled?: boolean;
  rotateAmplitude?: number;
  scaleOnHover?: number;
};

/**
 * Pointer-driven tilt + hover scale (TiltedCard-style), for circular menu orbs.
 */
export function TiltedOrb({
  children,
  className,
  style,
  disabled = false,
  rotateAmplitude = 12,
  scaleOnHover = 1.06,
}: TiltedOrbProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(false);

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) {
        setTilt({ x: 0, y: 0 });
        return;
      }
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const px = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const py = ((e.clientY - r.top) / r.height - 0.5) * 2;
      setTilt({
        x: -py * rotateAmplitude,
        y: px * rotateAmplitude,
      });
    },
    [disabled, rotateAmplitude],
  );

  const onEnter = useCallback(() => {
    if (!disabled) setHover(true);
  }, [disabled]);

  const onLeave = useCallback(() => {
    setHover(false);
    setTilt({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (disabled) {
      setHover(false);
      setTilt({ x: 0, y: 0 });
    }
  }, [disabled]);

  return (
    <div
      ref={ref}
      className={`infinite-menu-tilted-outer ${className ?? ''}`}
      style={{
        ...style,
        perspective: 640,
        transformStyle: 'preserve-3d',
      }}
      onPointerEnter={onEnter}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div
        className="infinite-menu-tilted-inner"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${hover && !disabled ? scaleOnHover : 1})`,
          transition: hover && !disabled ? 'transform 0.08s ease-out' : 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)',
          transformStyle: 'preserve-3d',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
        }}
      >
        {children}
      </div>
    </div>
  );
}
