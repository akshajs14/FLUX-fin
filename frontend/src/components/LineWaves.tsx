import { useEffect, useRef } from 'react';
import './LineWaves.css';

export type LineWavesProps = {
  speed?: number;
  innerLineCount?: number;
  outerLineCount?: number;
  warpIntensity?: number;
  /** Degrees */
  rotation?: number;
  edgeFadeWidth?: number;
  colorCycleSpeed?: number;
  brightness?: number;
  color1?: string;
  color2?: string;
  color3?: string;
  enableMouseInteraction?: boolean;
  mouseInfluence?: number;
  /** Fixed to viewport (full app pane behind UI) */
  fixed?: boolean;
  className?: string;
};

function hexToRgb01(hex: string): [number, number, number] {
  const s = hex.trim().replace(/^#/, '');
  const full = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  if (full.length !== 6) return [0.08, 0.15, 0.1];
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [0.08, 0.15, 0.1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[LineWaves]', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function createProgram(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null {
  const v = compileShader(gl, gl.VERTEX_SHADER, vs);
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('[LineWaves]', gl.getProgramInfoLog(p));
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

const VS = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FS = `
precision highp float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_rot;
uniform float u_inner;
uniform float u_outer;
uniform float u_warp;
uniform float u_brightness;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_speed;
uniform float u_cycle;
uniform float u_mouseInf;
uniform float u_edgeFade;

vec2 rot2(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main() {
  vec2 uv = v_uv;
  vec2 m = (u_mouse - 0.5) * u_mouseInf * 0.04;
  uv -= m * (0.5 + 0.5 * sin(u_time * 0.7));

  float asp = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);
  p = rot2(p, u_rot);

  float t = u_time * u_speed;
  float ang = atan(p.y, p.x);
  float rad = length(p) * 3.2;

  float wob = u_warp * sin(rad * 9.0 + t * 1.4) * cos(ang * 3.0 + t * 0.6);

  float li = abs(sin(ang * u_inner + wob * 2.5 + t * 1.1));
  float lo = abs(sin(rad * u_outer * 0.42 + wob * 1.8 + ang * 5.0 + t * 0.85));

  float line = pow(li, 10.0) * 0.55 + pow(lo, 7.0) * 0.65;
  line = clamp(line * 1.15, 0.0, 1.0);

  float cy = fract(u_time * 0.035 * u_cycle);
  vec3 mixA = mix(u_c1, u_c2, sin(cy * 6.2831853) * 0.5 + 0.5);
  vec3 mixB = mix(mixA, u_c3, sin(cy * 3.14159 + rad * 4.0) * 0.5 + 0.5);

  vec3 bg = u_c1 * 0.14;
  vec3 col = bg + mixB * line * u_brightness;

  if (u_edgeFade > 0.001) {
    vec2 e = min(v_uv, 1.0 - v_uv);
    float fe = smoothstep(0.0, u_edgeFade, min(e.x, e.y));
    col *= fe;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function LineWaves({
  speed = 0.3,
  innerLineCount = 32,
  outerLineCount = 36,
  warpIntensity = 1,
  rotation = -45,
  edgeFadeWidth = 0,
  colorCycleSpeed = 1,
  brightness = 0.2,
  color1 = '#0f2918',
  color2 = '#1a3d2a',
  color3 = '#122a1c',
  enableMouseInteraction = false,
  mouseInfluence = 2,
  fixed = true,
  className = '',
}: LineWavesProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const paramsRef = useRef({
    speed,
    innerLineCount,
    outerLineCount,
    warpIntensity,
    rotation,
    edgeFadeWidth,
    colorCycleSpeed,
    brightness,
    color1,
    color2,
    color3,
    mouseInfluence,
  });
  paramsRef.current = {
    speed,
    innerLineCount,
    outerLineCount,
    warpIntensity,
    rotation,
    edgeFadeWidth,
    colorCycleSpeed,
    brightness,
    color1,
    color2,
    color3,
    mouseInfluence,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) return;

    const program = createProgram(gl, VS, FS);
    if (!program) return;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'a_position');
    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');
    const uRot = gl.getUniformLocation(program, 'u_rot');
    const uInner = gl.getUniformLocation(program, 'u_inner');
    const uOuter = gl.getUniformLocation(program, 'u_outer');
    const uWarp = gl.getUniformLocation(program, 'u_warp');
    const uBright = gl.getUniformLocation(program, 'u_brightness');
    const uC1 = gl.getUniformLocation(program, 'u_c1');
    const uC2 = gl.getUniformLocation(program, 'u_c2');
    const uC3 = gl.getUniformLocation(program, 'u_c3');
    const uSpeed = gl.getUniformLocation(program, 'u_speed');
    const uCycle = gl.getUniformLocation(program, 'u_cycle');
    const uMouseInf = gl.getUniformLocation(program, 'u_mouseInf');
    const uEdge = gl.getUniformLocation(program, 'u_edgeFade');

    const t0 = performance.now();
    let cancelled = false;

    const setMouse = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      mouseRef.current = {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      };
    };

    const onMove = (e: MouseEvent) => setMouse(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length) setMouse(e.touches[0]!.clientX, e.touches[0]!.clientY);
    };

    if (enableMouseInteraction) {
      window.addEventListener('mousemove', onMove, { passive: true });
      window.addEventListener('touchmove', onTouch, { passive: true });
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      const { width, height } = host.getBoundingClientRect();
      const w = Math.max(1, Math.floor(width * dpr));
      const h = Math.max(1, Math.floor(height * dpr));
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      gl.viewport(0, 0, w, h);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    const draw = () => {
      if (cancelled) return;
      const p = paramsRef.current;
      const t = (performance.now() - t0) * 0.001;
      const [c1r, c1g, c1b] = hexToRgb01(p.color1);
      const [c2r, c2g, c2b] = hexToRgb01(p.color2);
      const [c3r, c3g, c3b] = hexToRgb01(p.color3);
      const mx = enableMouseInteraction ? mouseRef.current.x : 0.5;
      const my = enableMouseInteraction ? mouseRef.current.y : 0.5;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mx, my);
      gl.uniform1f(uRot, (p.rotation * Math.PI) / 180);
      gl.uniform1f(uInner, p.innerLineCount);
      gl.uniform1f(uOuter, p.outerLineCount);
      gl.uniform1f(uWarp, p.warpIntensity);
      gl.uniform1f(uBright, p.brightness);
      gl.uniform3f(uC1, c1r, c1g, c1b);
      gl.uniform3f(uC2, c2r, c2g, c2b);
      gl.uniform3f(uC3, c3r, c3g, c3b);
      gl.uniform1f(uSpeed, p.speed);
      gl.uniform1f(uCycle, p.colorCycleSpeed);
      gl.uniform1f(uMouseInf, p.mouseInfluence);
      gl.uniform1f(uEdge, p.edgeFadeWidth);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (enableMouseInteraction) {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('touchmove', onTouch);
      }
      gl.deleteProgram(program);
      gl.deleteBuffer(buf);
    };
  }, [enableMouseInteraction]);

  return (
    <div
      ref={hostRef}
      className={`line-waves${fixed ? ' line-waves--fixed' : ''} ${className}`.trim()}
      aria-hidden
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
