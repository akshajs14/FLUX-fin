import { useEffect, useRef, useState } from 'react';

type AnimateOn = 'mount' | 'view' | 'hover';

type DecryptedTextProps = {
  text: string;
  speed?: number;
  maxIterations?: number;
  characters?: string;
  className?: string;
  parentClassName?: string;
  encryptedClassName?: string;
  animateOn?: AnimateOn;
  revealDirection?: 'start' | 'end';
  sequential?: boolean;
  useOriginalCharsOnly?: boolean;
  onComplete?: () => void;
};

function pickRandom(pool: string): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? '?';
}

export function DecryptedText({
  text,
  speed = 52,
  maxIterations = 46,
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#%&█▓░Φ',
  className = '',
  parentClassName = '',
  encryptedClassName = '',
  animateOn = 'mount',
  revealDirection = 'start',
  sequential = true,
  useOriginalCharsOnly = false,
  onComplete,
}: DecryptedTextProps) {
  const pool = useOriginalCharsOnly
    ? Array.from(new Set(text.split('').filter(c => c.trim()))).join('') || characters
    : characters;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const isHover = animateOn === 'hover';

  const [display, setDisplay] = useState(() => {
    const c = text.split('');
    return isHover ? [...c] : c.map(ch => (ch === ' ' ? ' ' : pickRandom(pool)));
  });
  const [done, setDone] = useState(() => isHover);
  const [inView, setInView] = useState(() => animateOn !== 'view');
  const [hovering, setHovering] = useState(false);

  const rootRef = useRef<HTMLSpanElement>(null);
  const iterationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completeFiredRef = useRef(false);

  useEffect(() => {
    if (animateOn !== 'view') return;
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setInView(true);
      },
      { threshold: 0.12, rootMargin: '80px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [animateOn]);

  useEffect(() => {
    const startOk =
      animateOn === 'mount' ||
      (animateOn === 'view' && inView) ||
      (animateOn === 'hover' && hovering);
    if (!startOk) return;

    const chars = text.split('');
    const n = chars.length;

    iterationRef.current = 0;
    completeFiredRef.current = false;
    setDone(false);
    setDisplay(chars.map(c => (c === ' ' ? ' ' : pickRandom(pool))));

    const tick = () => {
      const iter = iterationRef.current;
      const progress = Math.min(1, (iter + 1) / maxIterations);
      iterationRef.current += 1;

      const next = chars.map((ch, i) => {
        if (ch === ' ') return ' ';
        let resolved: boolean;
        if (sequential) {
          const nUnlock = Math.min(n, Math.ceil(progress * n));
          resolved = revealDirection === 'end' ? i >= n - nUnlock : i < nUnlock;
        } else {
          resolved = Math.random() < progress * 1.12;
        }
        return resolved ? ch : pickRandom(pool);
      });

      setDisplay(next);

      const finished =
        next.every((c, i) => c === chars[i] || chars[i] === ' ') || iterationRef.current >= maxIterations;

      if (finished) {
        setDisplay([...chars]);
        setDone(true);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (!completeFiredRef.current) {
          completeFiredRef.current = true;
          onCompleteRef.current?.();
        }
      }
    };

    timerRef.current = setInterval(tick, speed);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    animateOn,
    hovering,
    inView,
    maxIterations,
    pool,
    revealDirection,
    sequential,
    speed,
    text,
  ]);

  const onMouseEnter = () => {
    if (animateOn === 'hover') setHovering(true);
  };

  const onMouseLeave = () => {
    if (animateOn !== 'hover') return;
    setHovering(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const c = text.split('');
    setDisplay([...c]);
    setDone(true);
    completeFiredRef.current = false;
  };

  const chars = text.split('');

  return (
    <span
      ref={rootRef}
      className={parentClassName}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className={className} aria-label={text}>
        {display.map((ch, i) => {
          const locked = done || ch === chars[i] || chars[i] === ' ';
          return (
            <span
              key={i}
              className={locked ? undefined : encryptedClassName}
              style={{ display: 'inline-block' }}
            >
              {ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}
