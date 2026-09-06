import type { AshLayer } from "./schema";
import { towardDeg, type WindReport } from "./wind-report";

/** Unit vector in screen space (x right, y down) for a compass bearing measured clockwise from north. */
export function driftVector(bearingDeg: number): { x: number; y: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  const round = (n: number): number => (Math.abs(n) < 1e-12 ? 0 : n);
  return { x: round(Math.sin(rad)), y: round(-Math.cos(rad)) };
}

const COMPASS_16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** Bearing for a 16-point compass abbreviation as used in VAAC advisories; null for anything else. */
export function compassToBearing(abbr: string): number | null {
  const idx = COMPASS_16.indexOf(abbr.trim().toUpperCase());
  return idx < 0 ? null : idx * 22.5;
}

/** Where ash travels at the tallest wind level we have. */
export function windDriftDeg(report: WindReport | null): number | null {
  if (!report?.levels.length) return null;
  const top = report.levels.reduce((a, b) => (b.approxKm > a.approxKm ? b : a));
  return towardDeg(top);
}

/** Direction an ash layer drifts: the advisory's own movement first, the wind as a fallback. */
export function layerDriftDeg(layer: AshLayer, wind: WindReport | null): number | null {
  const reported = layer.movement ? compassToBearing(layer.movement.direction) : null;
  return reported ?? windDriftDeg(wind);
}
