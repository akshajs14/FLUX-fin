export type StressMode = 'surge' | 'outage' | 'instability' | 'renewable';

export interface GridNode {
  id: number;
  x: number;
  y: number;
  type: 'substation' | 'generator' | 'solar' | 'wind' | 'residential' | 'commercial' | 'industrial';
  capacity: number;
  baseLoad: number;
  label: string;
}

export interface GridEdge {
  from: number;
  to: number;
  capacity: number;
}

export interface CityData {
  name: string;
  nodes: GridNode[];
  edges: GridEdge[];
  centerLat: number;
  centerLon: number;
}

export interface StressPoint {
  x: number;
  y: number;
  intensity: number;
  radius: number;
  mode: StressMode;
  time: number;
}

export interface SimMetrics {
  efficiency: number;
  outageReduction: number;
  loadBalancing: number;
  responseTime: number;
}
