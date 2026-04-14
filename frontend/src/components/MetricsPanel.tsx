import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { SimMetrics } from '../types';

function AnimatedCounter({ value, suffix = '%', color }: { value: number; suffix?: string; color: string }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => v.toFixed(1));
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ctrl = animate(motionValue, value, { duration: 1.2, ease: 'easeOut' });
    return () => ctrl.stop();
  }, [value, motionValue]);

  useEffect(() => {
    return rounded.on('change', (v) => {
      if (ref.current) ref.current.textContent = v + suffix;
    });
  }, [rounded, suffix]);

  return <span ref={ref} style={{ color }} className="metric-value">{value.toFixed(1)}{suffix}</span>;
}

interface MetricsPanelProps {
  metrics: SimMetrics;
  stressCount: number;
}

export function MetricsPanel({ metrics, stressCount }: MetricsPanelProps) {
  return (
    <motion.div
      className="metrics-panel glass-panel"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
    >
      <h3 className="panel-title">Live Metrics</h3>
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">Efficiency Increase</span>
          <AnimatedCounter value={metrics.efficiency} color="#4472f5" />
          <div className="metric-bar">
            <motion.div
              className="metric-bar-fill"
              style={{ background: '#4472f5' }}
              animate={{ width: `${Math.min(metrics.efficiency, 100)}%` }}
              transition={{ duration: 0.8 }}
            />
          </div>
        </div>

        <div className="metric-card">
          <span className="metric-label">Outage Reduction</span>
          <AnimatedCounter value={metrics.outageReduction} color="#38a769" />
          <div className="metric-bar">
            <motion.div
              className="metric-bar-fill"
              style={{ background: '#38a769' }}
              animate={{ width: `${Math.min(metrics.outageReduction, 100)}%` }}
              transition={{ duration: 0.8 }}
            />
          </div>
        </div>

        <div className="metric-card">
          <span className="metric-label">Load Balancing</span>
          <AnimatedCounter value={metrics.loadBalancing} color="#4472f5" />
          <div className="metric-bar">
            <motion.div
              className="metric-bar-fill"
              style={{ background: '#4472f5' }}
              animate={{ width: `${Math.min(metrics.loadBalancing, 100)}%` }}
              transition={{ duration: 0.8 }}
            />
          </div>
        </div>

        <div className="metric-card">
          <span className="metric-label">Response Time</span>
          <AnimatedCounter value={metrics.responseTime} suffix="ms" color="#7c6af0" />
          <div className="metric-bar">
            <motion.div
              className="metric-bar-fill"
              style={{ background: '#7c6af0' }}
              animate={{ width: `${Math.min(100 - metrics.responseTime / 5, 100)}%` }}
              transition={{ duration: 0.8 }}
            />
          </div>
        </div>
      </div>

      <div className="stress-indicator">
        <span className="metric-label">Active Stress Points</span>
        <span className="metric-value" style={{ color: stressCount > 0 ? '#c97d28' : '#6b7685' }}>
          {stressCount}
        </span>
      </div>
    </motion.div>
  );
}
