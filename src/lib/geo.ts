import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import distance from "@turf/distance";
import { point, polygon as turfPolygon } from "@turf/helpers";
import type { AshLayer, LonLat } from "./schema";

/** GeoJSON rings must end where they start; VAAC polygons do not repeat the first point. */
export function closeRing(ring: LonLat[]): LonLat[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return ring;
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

export function layersContaining(lon: number, lat: number, layers: AshLayer[]): AshLayer[] {
  const p = point([lon, lat]);
  return layers.filter(
    (l) => l.polygon.length >= 3 && booleanPointInPolygon(p, turfPolygon([closeRing(l.polygon)])),
  );
}

export function distanceKm(aLon: number, aLat: number, bLon: number, bLat: number): number {
  return distance(point([aLon, aLat]), point([bLon, bLat]), { units: "kilometers" });
}

const EARTH_RADIUS_KM = 6371;

/** Area of a lon/lat ring in km2, by spherical excess (accurate for advisory-sized polygons). */
export function polygonAreaKm2(ring: LonLat[]): number {
  const pts = closeRing(ring);
  if (pts.length < 4) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [lon1, lat1] = pts[i]!;
    const [lon2, lat2] = pts[i + 1]!;
    sum += ((lon2 - lon1) * Math.PI / 180) * (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((sum * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

/** Distance from a point to the farthest vertex of a ring, in km. */
export function maxDistanceKm(lon: number, lat: number, ring: LonLat[]): number {
  return ring.reduce((max, [vLon, vLat]) => Math.max(max, distanceKm(lon, lat, vLon, vLat)), 0);
}
