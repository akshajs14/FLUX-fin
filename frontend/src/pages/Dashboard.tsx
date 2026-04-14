import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CityGrid } from '../components/CityGrid';
import { CitySelector } from '../components/CitySelector';
import { ControlPanel } from '../components/ControlPanel';
import { MetricsPanel } from '../components/MetricsPanel';
import { CITIES } from '../data/cities';
import type { SimMetrics, StressMode, StressPoint } from '../types';

function computeMetrics(stressPoints: StressPoint[]): SimMetrics {
  const totalStress = stressPoints.reduce((s, p) => s + p.intensity, 0);
  const stressLevel = Math.min(totalStress / 3, 1);

  return {
    efficiency: 20 + (1 - stressLevel * 0.4) * 25 + Math.sin(Date.now() / 3000) * 2,
    outageReduction: 75 + (1 - stressLevel * 0.6) * 20 + Math.cos(Date.now() / 4000) * 1.5,
    loadBalancing: 80 + (1 - stressLevel * 0.5) * 15 + Math.sin(Date.now() / 2500) * 1,
    responseTime: 12 + stressLevel * 35 + Math.random() * 5,
  };
}

interface DashboardProps {
  onBack: () => void;
}

export function Dashboard({ onBack }: DashboardProps) {
  const [selectedCity, setSelectedCity] = useState('New York');
  const [mode, setMode] = useState<StressMode>('surge');
  const [intensity, setIntensity] = useState(0.7);
  const [brushSize, setBrushSize] = useState(4);
  const [isPaused, setIsPaused] = useState(false);
  const [stressPoints, setStressPoints] = useState<StressPoint[]>([]);
  const [metrics, setMetrics] = useState<SimMetrics>({
    efficiency: 38.5,
    outageReduction: 92.0,
    loadBalancing: 94.5,
    responseTime: 18,
  });
  const [replayState, setReplayState] = useState<'idle' | 'chaos' | 'fixing'>('idle');

  const city = useMemo(
    () => CITIES.find((c) => c.name === selectedCity) ?? CITIES[0],
    [selectedCity]
  );

  const handleAddStress = useCallback((pt: StressPoint) => {
    setStressPoints((prev) => {
      // Limit total stress points for performance
      const next = [...prev, pt];
      return next.length > 300 ? next.slice(-300) : next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setStressPoints([]);
    setReplayState('idle');
  }, []);

  const handleCityChange = useCallback((name: string) => {
    setSelectedCity(name);
    setStressPoints([]);
    setReplayState('idle');
  }, []);

  const handleReplay = useCallback(() => {
    setReplayState('chaos');
    // Generate random stress points to simulate chaos
    const newStress: StressPoint[] = [];
    for (let i = 0; i < 40; i++) {
      newStress.push({
        x: 0.2 + Math.random() * 0.6,
        y: 0.2 + Math.random() * 0.6,
        intensity: 0.3 + Math.random() * 0.7,
        radius: 0.05 + Math.random() * 0.1,
        mode: (['surge', 'outage', 'instability'] as StressMode[])[Math.floor(Math.random() * 3)],
        time: Date.now(),
      });
    }
    setStressPoints(newStress);

    // After delay, switch to "fixing" and gradually remove stress
    setTimeout(() => {
      setReplayState('fixing');
      const interval = setInterval(() => {
        setStressPoints((prev) => {
          if (prev.length <= 2) {
            clearInterval(interval);
            setReplayState('idle');
            return [];
          }
          return prev.slice(3);
        });
      }, 150);
    }, 3000);
  }, []);

  // Update metrics periodically
  useEffect(() => {
    const id = setInterval(() => {
      setMetrics(computeMetrics(stressPoints));
    }, 500);
    return () => clearInterval(id);
  }, [stressPoints]);

  return (
    <motion.div
      className="dashboard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-left">
          <button className="back-btn" onClick={onBack}>
            \u2190 Back
          </button>
          <div className="dash-brand">
            <span className="dash-logo">\u26A1</span>
            <h1>Flux</h1>
          </div>
        </div>
        <CitySelector selected={selectedCity} onSelect={handleCityChange} />
        <div className="dash-header-right">
          <AnimatePresence>
            {replayState !== 'idle' && (
              <motion.div
                className="replay-badge"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                style={{
                  color: replayState === 'chaos' ? '#c97d28' : '#38a769',
                }}
              >
                {replayState === 'chaos' ? 'Simulating Chaos...' : 'AI Stabilizing...'}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Main split view */}
      <div className="dash-main">
        {/* Left: AI-Optimized */}
        <div className="grid-panel">
          <div className="grid-panel-header ai-side">
            <div className="grid-panel-indicator ai" />
            <h2>AI-Optimized Grid</h2>
            <span className="grid-panel-tag">Stabilized</span>
          </div>
          <div className="grid-canvas-wrap">
            <CityGrid
              city={city}
              stressPoints={stressPoints}
              isAiSide={true}
              mode={mode}
              intensity={intensity}
              brushSize={brushSize}
              isPaused={isPaused}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="grid-divider">
          <div className="grid-divider-line" />
          <div className="grid-divider-label">VS</div>
          <div className="grid-divider-line" />
        </div>

        {/* Right: Raw Grid */}
        <div className="grid-panel">
          <div className="grid-panel-header stress-side">
            <div className="grid-panel-indicator stress" />
            <h2>Raw Grid / Stress Simulation</h2>
            <span className="grid-panel-tag">Interactive</span>
          </div>
          <div className="grid-canvas-wrap">
            <CityGrid
              city={city}
              stressPoints={stressPoints}
              onAddStress={handleAddStress}
              isAiSide={false}
              mode={mode}
              intensity={intensity}
              brushSize={brushSize}
              isPaused={isPaused}
            />
            {stressPoints.length === 0 && (
              <div className="grid-hint">
                Click and drag to paint stress on the grid
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating panels */}
      <ControlPanel
        mode={mode}
        onModeChange={setMode}
        intensity={intensity}
        onIntensityChange={setIntensity}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused((p) => !p)}
        onReset={handleReset}
        onReplay={handleReplay}
      />

      <MetricsPanel
        metrics={metrics}
        stressCount={stressPoints.length}
      />
    </motion.div>
  );
}
