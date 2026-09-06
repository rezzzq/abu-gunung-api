import { z } from "zod";

export type WindLevelKey = "surface" | "low" | "mid" | "high";

export interface WindLevel {
  key: WindLevelKey;
  /** Approximate height of the pressure level above sea level. */
  approxKm: number;
  speedKmh: number;
  /** Meteorological convention: the direction the wind blows FROM, degrees clockwise from north. */
  fromDeg: number;
}

export interface WindReport {
  time: string;
  levels: WindLevel[];
}

const numberOrNull = z.array(z.number().nullable());
const openMeteoSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    wind_speed_10m: numberOrNull,
    wind_direction_10m: numberOrNull,
    wind_speed_850hPa: numberOrNull,
    wind_direction_850hPa: numberOrNull,
    wind_speed_500hPa: numberOrNull,
    wind_direction_500hPa: numberOrNull,
    wind_speed_250hPa: numberOrNull,
    wind_direction_250hPa: numberOrNull,
  }),
});
type Hourly = z.infer<typeof openMeteoSchema>["hourly"];

const LEVELS: { key: WindLevelKey; approxKm: number; speed: keyof Hourly; dir: keyof Hourly }[] = [
  { key: "surface", approxKm: 0, speed: "wind_speed_10m", dir: "wind_direction_10m" },
  { key: "low", approxKm: 1.5, speed: "wind_speed_850hPa", dir: "wind_direction_850hPa" },
  { key: "mid", approxKm: 5.5, speed: "wind_speed_500hPa", dir: "wind_direction_500hPa" },
  { key: "high", approxKm: 10.5, speed: "wind_speed_250hPa", dir: "wind_direction_250hPa" },
];

/** Picks the forecast hour closest to `now` and returns one entry per level that has data. */
export function pickWindReport(raw: unknown, now: Date): WindReport | null {
  const parsed = openMeteoSchema.safeParse(raw);
  if (!parsed.success) return null;
  const hourly = parsed.data.hourly;
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  hourly.time.forEach((iso, i) => {
    const dist = Math.abs(new Date(`${iso}Z`).getTime() - now.getTime());
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  if (best < 0) return null;
  const levels: WindLevel[] = [];
  for (const level of LEVELS) {
    const speed = hourly[level.speed][best];
    const dir = hourly[level.dir][best];
    if (typeof speed !== "number" || typeof dir !== "number") continue;
    levels.push({ key: level.key, approxKm: level.approxKm, speedKmh: speed, fromDeg: dir });
  }
  return levels.length ? { time: `${hourly.time[best]}Z`, levels } : null;
}

/** Bearing the ash travels toward: the opposite of where the wind comes from. */
export function towardDeg(level: WindLevel): number {
  return (level.fromDeg + 180) % 360;
}

const EARTH_RADIUS_KM = 6371;

/** Destination point along a great circle, returned as [lat, lon]. */
export function destinationPoint(lat: number, lon: number, bearingDeg: number, distanceKm: number): [number, number] {
  const d = distanceKm / EARTH_RADIUS_KM;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lon2 =
    lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}
