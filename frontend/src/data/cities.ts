import type { CityData, GridNode, GridEdge } from '../types';

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const NODE_TYPES: GridNode['type'][] = [
  'substation', 'generator', 'solar', 'wind',
  'residential', 'commercial', 'industrial',
];

const TYPE_LABELS: Record<GridNode['type'], string> = {
  substation: 'Substation',
  generator: 'Power Plant',
  solar: 'Solar Farm',
  wind: 'Wind Farm',
  residential: 'Residential',
  commercial: 'Commercial',
  industrial: 'Industrial',
};

function generateCityGrid(name: string, nodeCount: number): { nodes: GridNode[]; edges: GridEdge[] } {
  const rng = mulberry32(hashStr(name));
  const nodes: GridNode[] = [];
  const edges: GridEdge[] = [];

  // Create cluster centers
  const clusterCount = 3 + Math.floor(rng() * 3);
  const clusters: { cx: number; cy: number }[] = [];
  for (let i = 0; i < clusterCount; i++) {
    clusters.push({
      cx: 0.15 + rng() * 0.7,
      cy: 0.15 + rng() * 0.7,
    });
  }

  // Generate nodes around clusters
  for (let i = 0; i < nodeCount; i++) {
    const cluster = clusters[i % clusterCount];
    const angle = rng() * Math.PI * 2;
    const dist = 0.05 + rng() * 0.15;
    const typeIdx = Math.floor(rng() * NODE_TYPES.length);
    const type = NODE_TYPES[typeIdx];

    nodes.push({
      id: i,
      x: Math.max(0.05, Math.min(0.95, cluster.cx + Math.cos(angle) * dist)),
      y: Math.max(0.05, Math.min(0.95, cluster.cy + Math.sin(angle) * dist)),
      type,
      capacity: 50 + Math.floor(rng() * 450),
      baseLoad: 20 + Math.floor(rng() * 200),
      label: `${TYPE_LABELS[type]} ${i + 1}`,
    });
  }

  // Connect nodes within distance threshold
  for (let i = 0; i < nodes.length; i++) {
    const connections: { idx: number; dist: number }[] = [];
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.25) {
        connections.push({ idx: j, dist: d });
      }
    }
    // Sort by distance, take closest 2-4
    connections.sort((a, b) => a.dist - b.dist);
    const take = Math.min(connections.length, 2 + Math.floor(rng() * 2));
    for (let k = 0; k < take; k++) {
      edges.push({
        from: i,
        to: connections[k].idx,
        capacity: 100 + Math.floor(rng() * 400),
      });
    }
  }

  // Ensure connectivity: connect isolated clusters
  for (let c = 1; c < clusterCount; c++) {
    const nodesInCluster = nodes.filter((_, idx) => idx % clusterCount === c);
    const nodesInPrev = nodes.filter((_, idx) => idx % clusterCount === c - 1);
    if (nodesInCluster.length > 0 && nodesInPrev.length > 0) {
      const a = nodesInCluster[0];
      const b = nodesInPrev[0];
      const exists = edges.some(
        (e) =>
          (e.from === a.id && e.to === b.id) ||
          (e.from === b.id && e.to === a.id)
      );
      if (!exists) {
        edges.push({ from: a.id, to: b.id, capacity: 200 + Math.floor(rng() * 300) });
      }
    }
  }

  return { nodes, edges };
}

const CITY_CONFIGS: { name: string; lat: number; lon: number; nodes: number }[] = [
  { name: 'New York', lat: 40.7128, lon: -74.006, nodes: 32 },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, nodes: 30 },
  { name: 'Chicago', lat: 41.8781, lon: -87.6298, nodes: 28 },
  { name: 'Houston', lat: 29.7604, lon: -95.3698, nodes: 27 },
  { name: 'Phoenix', lat: 33.4484, lon: -112.074, nodes: 25 },
  { name: 'Philadelphia', lat: 39.9526, lon: -75.1652, nodes: 26 },
  { name: 'San Antonio', lat: 29.4241, lon: -98.4936, nodes: 24 },
  { name: 'San Diego', lat: 32.7157, lon: -117.1611, nodes: 24 },
  { name: 'Dallas', lat: 32.7767, lon: -96.797, nodes: 27 },
  { name: 'San Jose', lat: 37.3382, lon: -121.8863, nodes: 25 },
];

export const CITIES: CityData[] = CITY_CONFIGS.map((cfg) => {
  const { nodes, edges } = generateCityGrid(cfg.name, cfg.nodes);
  return {
    name: cfg.name,
    nodes,
    edges,
    centerLat: cfg.lat,
    centerLon: cfg.lon,
  };
});

export const CITY_NAMES = CITIES.map((c) => c.name);
