import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.15, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

const FEATURES = [
  {
    icon: '\u{1F9E0}',
    title: 'Predictive Demand Modeling',
    desc: 'AI forecasts energy demand hours ahead using weather, usage patterns, and real-time sensor data to prevent shortfalls before they happen.',
  },
  {
    icon: '\u{1F50C}',
    title: 'Outage Prevention',
    desc: 'Detect grid instabilities in milliseconds and automatically reroute power to prevent cascading failures across urban infrastructure.',
  },
  {
    icon: '\u{2697}\u{FE0F}',
    title: 'Smart Distribution',
    desc: 'Optimize energy flow across thousands of grid nodes, balancing renewable sources with traditional generation for maximum efficiency.',
  },
  {
    icon: '\u{1F3D9}\u{FE0F}',
    title: 'Urban Resilience',
    desc: 'Purpose-built for modern megacities facing growing populations, extreme weather, and aging infrastructure demanding intelligent solutions.',
  },
];

interface LandingProps {
  onNavigate: () => void;
}

export function Landing({ onNavigate }: LandingProps) {
  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero">
        <motion.div
          className="hero-content"
          initial="hidden"
          animate="visible"
        >
          <motion.div className="hero-badge" custom={0} variants={fadeUp}>
            AI-Powered Grid Intelligence
          </motion.div>

          <motion.h1 className="hero-title" custom={1} variants={fadeUp}>
            <span className="hero-title-glow">Flux</span>
          </motion.h1>

          <motion.p className="hero-subtitle" custom={2} variants={fadeUp}>
            AI-Powered Energy Efficiency & Grid Resiliency
            <br />
            for Modern Cities
          </motion.p>

          <motion.p className="hero-desc" custom={3} variants={fadeUp}>
            Flux uses advanced machine learning to predict demand, prevent outages,
            and optimize power distribution across urban energy grids in real time.
          </motion.p>

          <motion.button
            className="cta-button"
            custom={4}
            variants={fadeUp}
            onClick={onNavigate}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="cta-text">Explore Simulation</span>
            <span className="cta-arrow">\u2192</span>
          </motion.button>
        </motion.div>

        <motion.div
          className="scroll-hint"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
        >
          <span>Scroll to learn more</span>
          <div className="scroll-arrow" />
        </motion.div>
      </section>

      {/* Why section */}
      <section className="why-section">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
        >
          <h2>Why Flux?</h2>
          <p>
            Urban power grids serve billions of people but run on aging infrastructure
            pushed to its limits. Climate volatility, EV adoption, and data center
            proliferation are creating unprecedented strain. Flux brings AI-driven
            intelligence to prevent what's coming.
          </p>
        </motion.div>

        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              className="feature-card glass-panel"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
            >
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Stats section */}
      <section className="stats-section">
        <motion.div
          className="stats-grid"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {[
            { value: '40%', label: 'Efficiency Gain' },
            { value: '92%', label: 'Outage Prevention' },
            { value: '<50ms', label: 'Response Time' },
            { value: '10+', label: 'Cities Simulated' },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              className="stat-card"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* CTA section */}
      <section className="cta-section">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2>See Flux in Action</h2>
          <p>
            Interact with a live simulation. Paint grid stress, trigger outages,
            and watch AI stabilize the system in real time.
          </p>
          <motion.button
            className="cta-button large"
            onClick={onNavigate}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="cta-text">Launch Simulation</span>
            <span className="cta-arrow">\u2192</span>
          </motion.button>
        </motion.div>
      </section>
    </div>
  );
}
