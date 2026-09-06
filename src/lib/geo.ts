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
