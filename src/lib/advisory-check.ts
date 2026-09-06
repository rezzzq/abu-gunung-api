import { maxDistanceKm, polygonAreaKm2 } from "./geo";
import type { Advisory, AshLayer } from "./schema";

/**
 * Generous box around Darwin VAAC's area: a high ash cloud can drift for days, and on
 * 6 Sep 2026 Krakatau's FL500 cloud reached 79 E. Only plainly wrong coordinates fail.
 */
const DARWIN = { west: 60, east: 180, south: -45, north: 25 };
const MAX_AREA_KM2 = 8_000_000;
const MAX_REACH_KM = 6_000;
const MAX_AGE_H = 72;
const MAX_FUTURE_MIN = 90;

function layerProblems(layer: AshLayer, label: string, origin: { lat: number; lon: number } | null): string[] {
  const problems: string[] = [];
  if (layer.topFl < layer.baseFl) problems.push(`${label}: top below base (FL${layer.topFl} < FL${layer.baseFl})`);
  const outside = layer.polygon.some(([lon, lat]) => lon < DARWIN.west || lon > DARWIN.east || lat < DARWIN.south || lat > DARWIN.north);
  if (outside) problems.push(`${label}: polygon outside the Darwin area`);
  else {
    const area = polygonAreaKm2(layer.polygon);
    if (area > MAX_AREA_KM2) problems.push(`${label}: polygon too large (${Math.round(area)} km2)`);
    if (origin && maxDistanceKm(origin.lon, origin.lat, layer.polygon) > MAX_REACH_KM) problems.push(`${label}: polygon too far from the volcano`);
  }
  return problems;
}

/** True when the advisory is so old that it no longer describes anything current. */
export function isStale(adv: Advisory, now: Date): boolean {
  return now.getTime() - Date.parse(adv.issuedAt) > MAX_AGE_H * 3_600_000;
}

/** True for Darwin advisories about Indonesian volcanoes; the map does not cover PNG or Vanuatu. */
export function isIndonesian(adv: Advisory): boolean {
  return /INDONESIA/i.test(adv.area ?? "");
}

/**
 * Sanity checks on a parsed advisory. An empty list means it can be published;
 * anything else means keep the previous advisory and record the reason.
 */
export function advisoryProblems(adv: Advisory, now: Date): string[] {
  const problems: string[] = [];
  const issued = Date.parse(adv.issuedAt);
  if (issued - now.getTime() > MAX_FUTURE_MIN * 60_000) problems.push(`issued ${adv.issuedAt} is in the future`);
  const origin = adv.position;
  adv.observation?.layers.forEach((l, i) => problems.push(...layerProblems(l, `observation layer ${i + 1}`, origin)));
  for (const f of adv.forecasts) f.layers.forEach((l, i) => problems.push(...layerProblems(l, `+${f.hoursAhead} h layer ${i + 1}`, origin)));
  return problems;
}
