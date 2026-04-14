import { motion } from 'framer-motion';
import { CITY_NAMES } from '../data/cities';

interface CitySelectorProps {
  selected: string;
  onSelect: (city: string) => void;
}

export function CitySelector({ selected, onSelect }: CitySelectorProps) {
  return (
    <div className="city-selector">
      <div className="city-tabs">
        {CITY_NAMES.map((name) => (
          <button
            key={name}
            className={`city-tab ${selected === name ? 'active' : ''}`}
            onClick={() => onSelect(name)}
          >
            {selected === name && (
              <motion.div
                className="city-tab-bg"
                layoutId="activeCity"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="city-tab-text">{name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
