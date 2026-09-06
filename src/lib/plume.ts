import { towardDeg, type WindReport } from "./wind-report";

/** Unit vector in screen space (x right, y down) for a compass bearing measured clockwise from north. */
export function driftVector(bearingDeg: number): { x: number; y: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  const round = (n: number): number => (Math.abs(n) < 1e-12 ? 0 : n);
  return { x: round(Math.sin(rad)), y: round(-Math.cos(rad)) };
}

/** Direction the plume drifts on screen: where ash travels at the tallest wind level we have. */
export function plumeDriftDeg(report: WindReport | null): number | null {
  if (!report?.levels.length) return null;
  const top = report.levels.reduce((a, b) => (b.approxKm > a.approxKm ? b : a));
  return towardDeg(top);
}
