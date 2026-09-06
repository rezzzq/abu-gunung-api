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

export const magmaSchema = z.object({
  fetchedAt: isoDateTime,
  activityLevel: activityLevelSchema.nullable(),
  latestVona: vonaSchema.nullable(),
});

export const satelliteSchema = z.object({
  layer: z.string(),
  latestFrameTime: isoDateTime.nullable(),
});

export const latestDataSchema = z.object({
  generatedAt: isoDateTime,
  volcano: z.object({ name: z.string(), lat: z.number(), lon: z.number(), elevationM: z.number() }),
  vaac: advisorySchema.nullable(),
  magma: magmaSchema.nullable(),
  satellite: satelliteSchema.nullable(),
  sourceErrors: z.array(z.string()),
});

export type LonLat = z.infer<typeof lonLatSchema>;
export type AshLayer = z.infer<typeof layerSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Forecast = z.infer<typeof forecastSchema>;
export type Advisory = z.infer<typeof advisorySchema>;
export type ActivityLevel = z.infer<typeof activityLevelSchema>;
export type VonaEntry = z.infer<typeof vonaSchema>;
export type MagmaStatus = z.infer<typeof magmaSchema>;
export type SatelliteInfo = z.infer<typeof satelliteSchema>;
export type LatestData = z.infer<typeof latestDataSchema>;
