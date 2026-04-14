import type { ComponentProps } from 'react';
import { BorderGlow } from './BorderGlow';

export type GlowFrameProps = ComponentProps<typeof BorderGlow>;

const GLOW_DEFAULTS: Partial<GlowFrameProps> = {
  backgroundColor: 'var(--card)',
  glowColor: '212 148 46',
  borderRadius: 10,
  glowRadius: 38,
  edgeSensitivity: 28,
  glowIntensity: 0.9,
  coneSpread: 22,
  colors: ['#c084fc', '#f472b6', '#38bdf8'],
};

/** Theme-aligned `BorderGlow` preset for Flux panels and controls. */
export function GlowFrame({ children, ...rest }: GlowFrameProps) {
  return (
    <BorderGlow {...GLOW_DEFAULTS} {...rest}>
      {children}
    </BorderGlow>
  );
}
