/** Parse `#rgb`, `#rrggbb`, or `rgb(...)` / `rgba(...)` into 8-bit RGB. */
export function hexToRgb(hex: string): [number, number, number] {
  const s = hex.trim().replace(/^#/, '');
  if (s.length === 3) {
    const n = parseInt(s.split('').map(c => c + c).join(''), 16);
    if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  if (s.length === 6) {
    const n = parseInt(s, 16);
    if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return [0, 0, 0];
}

export function parseCssColorToRgb(input: string): [number, number, number] {
  const s = input.trim();
  if (s.startsWith('#')) return hexToRgb(s);
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) {
    return [
      Math.round(Number(m[1])),
      Math.round(Number(m[2])),
      Math.round(Number(m[3])),
    ];
  }
  return [0, 0, 0];
}

/** Exponential approach to 1; use as lerp factor per frame. Higher `rate` = faster settle. */
export function smoothStepDt(dtSec: number, rate = 4.8): number {
  if (dtSec <= 0) return 1;
  return 1 - Math.exp(-rate * dtSec);
}
