import { z } from "zod";

/** ISO 8601 timestamp in UTC with a trailing Z, seconds precision or better. */
export const isoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, "ISO 8601 UTC timestamp expected");

/** GeoJSON order: [longitude, latitude]. */
export const lonLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const movementSchema = z.object({
  direction: z.string().min(1),
  speedKt: z.number().min(0),
});

/** One ash cloud layer between two flight levels. baseFl 0 means the surface. */
export const layerSchema = z.object({
  baseFl: z.number().int().min(0),
  topFl: z.number().int().min(0),
  polygon: z.array(lonLatSchema).min(3),
  movement: movementSchema.nullable(),
});

export const observationSchema = z.object({
  kind: z.enum(["OBS", "EST"]),
  time: isoDateTime,
  layers: z.array(layerSchema),
});

export const forecastSchema = z.object({
  hoursAhead: z.number().int().positive(),
  time: isoDateTime,
  layers: z.array(layerSchema),
});

export const advisorySchema = z.object({
  header: z.string().min(1),
  issuedAt: isoDateTime,
  volcano: z.string().min(1),
  /** Source position from the PSN line, null when the bulletin has none. */
  position: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).nullable(),
  /** Summit elevation in metres from SOURCE ELEV, null when missing. */
  elevationM: z.number().nullable(),
  advisoryNumber: z.string().nullable(),
  infoSource: z.string().nullable(),
  eruptionDetails: z.string().nullable(),
  remarks: z.string().nullable(),
  nextAdvisoryBy: isoDateTime.nullable(),
  observation: observationSchema.nullable(),
  forecasts: z.array(forecastSchema),
  raw: z.string(),
});

export const activityLevelSchema = z.object({
  level: z.number().int().min(1).max(4),
  name: z.string().min(1),
});

export const vonaSchema = z.object({
  time: isoDateTime,
  colorCode: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.url().nullable(),
});


export const satelliteSchema = z.object({
  layer: z.string(),
  latestFrameTime: isoDateTime.nullable(),
});

/** One volcano on the map: identity, position, its newest advisory and its MAGMA status. */
export const volcanoStatusSchema = z.object({
  /** MAGMA VONA code (KRA, SMR, ...) or a slug of the VAAC name when MAGMA does not list it. */
  id: z.string().min(1),
  name: z.string().min(1),
  gvp: z.string().nullable(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  elevationM: z.number().nullable(),
  region: z.string().nullable(),
  vaac: advisorySchema.nullable(),
  /** True when the advisory is fresh and not terminated; only active volcanoes carry ash zones. */
  active: z.boolean(),
  activityLevel: activityLevelSchema.nullable(),
  latestVona: vonaSchema.nullable(),
});

export const latestDataSchema = z.object({
  generatedAt: isoDateTime,
  /** Active volcanoes first, highest ash top first; then Level III/IV volcanoes. */
  volcanoes: z.array(volcanoStatusSchema),
  magmaFetchedAt: isoDateTime.nullable(),
  satellite: satelliteSchema.nullable(),
  sourceErrors: z.array(z.string()),
});

/** Sidecar written by scripts/ash_rgb.py next to the Himawari-9 Ash RGB image. */
export const himawariRgbSchema = z.object({
  scanTime: isoDateTime.nullable(),
  generatedAt: isoDateTime,
  bounds: z.object({ west: z.number(), south: z.number(), east: z.number(), north: z.number() }),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  image: z.string().min(1).nullable(),
  source: z.string(),
  error: z.string().nullable(),
});

export type LonLat = z.infer<typeof lonLatSchema>;
export type AshLayer = z.infer<typeof layerSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Forecast = z.infer<typeof forecastSchema>;
export type Advisory = z.infer<typeof advisorySchema>;
export type ActivityLevel = z.infer<typeof activityLevelSchema>;
export type VonaEntry = z.infer<typeof vonaSchema>;
export type VolcanoStatus = z.infer<typeof volcanoStatusSchema>;
export type SatelliteInfo = z.infer<typeof satelliteSchema>;
export type LatestData = z.infer<typeof latestDataSchema>;
export type HimawariRgb = z.infer<typeof himawariRgbSchema>;
