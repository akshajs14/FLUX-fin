import { motion } from 'framer-motion';
import type { StressMode } from '../types';

interface ControlPanelProps {
  mode: StressMode;
  onModeChange: (m: StressMode) => void;
  intensity: number;
  onIntensityChange: (v: number) => void;
  brushSize: number;
  onBrushSizeChange: (v: number) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onReset: () => void;
  onReplay: () => void;
}

const MODES: { value: StressMode; label: string; icon: string; color: string }[] = [
  { value: 'surge', label: 'Power Surge', icon: '\u26A1', color: '#c97d28' },
  { value: 'outage', label: 'Outage', icon: '\u26AB', color: '#6b7685' },
  { value: 'instability', label: 'Instability', icon: '\u2B50', color: '#7c6af0' },
  { value: 'renewable', label: 'Renewable Flux', icon: '\u2600', color: '#38a769' },
];

export function ControlPanel({
  mode,
  onModeChange,
  intensity,
  onIntensityChange,
  brushSize,
  onBrushSizeChange,
  isPaused,
  onTogglePause,
  onReset,
  onReplay,
}: ControlPanelProps) {
  return (
    <motion.div
      className="control-panel glass-panel"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <h3 className="panel-title">Simulation Controls</h3>

      <div className="control-section">
        <label className="control-label">Stress Mode</label>
        <div className="mode-grid">
          {MODES.map((m) => (
            <button
              key={m.value}
              className={`mode-btn ${mode === m.value ? 'active' : ''}`}
              style={{
                borderColor: mode === m.value ? m.color : undefined,
                background: mode === m.value ? `${m.color}15` : undefined,
              }}
              onClick={() => onModeChange(m.value)}
            >
              <span className="mode-icon">{m.icon}</span>
              <span className="mode-label">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="control-section">
        <label className="control-label">
          Intensity
          <span className="control-value">{Math.round(intensity * 100)}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={intensity * 100}
          onChange={(e) => onIntensityChange(Number(e.target.value) / 100)}
          className="flux-range"
        />
      </div>

      <div className="control-section">
        <label className="control-label">
          Brush Size
          <span className="control-value">{brushSize}</span>
        </label>
        <input
          type="range"
          min={1}
          max={10}
          value={brushSize}
          onChange={(e) => onBrushSizeChange(Number(e.target.value))}
          className="flux-range"
        />
      </div>

      <div className="control-actions">
        <button className="action-btn" onClick={onTogglePause}>
          {isPaused ? '\u25B6 Play' : '\u23F8 Pause'}
        </button>
        <button className="action-btn" onClick={onReplay}>
          \u21BB Replay
        </button>
        <button className="action-btn danger" onClick={onReset}>
          \u2715 Reset
        </button>
      </div>
    </motion.div>
  );
}
