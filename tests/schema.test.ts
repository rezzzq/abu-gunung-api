import { describe, expect, it } from "vitest";
import { himawariRgbSchema, latestDataSchema, layerSchema } from "../src/lib/schema";

const validLayer = {
  baseFl: 0,
  topFl: 500,
  polygon: [
    [105, -6],
    [106, -6],
    [106, -7],
  ],
  movement: { direction: "W", speedKt: 30 },
};

const minimalDoc = {
  generatedAt: "2026-09-06T02:00:00Z",
  volcanoes: [],
  magmaFetchedAt: null,
  satellite: null,
  sourceErrors: [],
};
const volcano = {
  id: "KRA",
  name: "Anak Krakatau",
  gvp: "262000",
  lat: -6.1,
  lon: 105.4,
  elevationM: 155,
  region: "Selat Sunda",
  vaac: null,
  active: false,
  activityLevel: { level: 3, name: "Siaga" },
  latestVona: null,
};

describe("schema", () => {
  it("accepts a valid layer", () => {
    expect(layerSchema.safeParse(validLayer).success).toBe(true);
  });

  it("rejects a polygon with fewer than 3 points", () => {
    const r = layerSchema.safeParse({ ...validLayer, polygon: [[105, -6], [106, -6]] });
    expect(r.success).toBe(false);
  });

  it("rejects a non-ISO timestamp at top level", () => {
    const r = latestDataSchema.safeParse({ ...minimalDoc, generatedAt: "yesterday" });
    expect(r.success).toBe(false);
  });

  it("accepts a minimal valid document", () => {
    expect(latestDataSchema.safeParse(minimalDoc).success).toBe(true);
  });

  it("accepts a volcano entry and rejects an activity level outside 1-4", () => {
    expect(latestDataSchema.safeParse({ ...minimalDoc, volcanoes: [volcano] }).success).toBe(true);
    const r = latestDataSchema.safeParse({ ...minimalDoc, volcanoes: [{ ...volcano, activityLevel: { level: 5, name: "x" } }] });
    expect(r.success).toBe(false);
  });
});

describe("himawariRgbSchema", () => {
  const meta = {
    scanTime: "2026-09-06T09:20:00Z",
    generatedAt: "2026-09-06T09:36:13Z",
    bounds: { west: 99, south: -13, east: 113, north: 0 },
    width: 779,
    height: 730,
    image: "ash-rgb.webp",
    source: "Himawari-9 AHI via NOAA Open Data (JMA Ash RGB recipe)",
    error: null,
  };

  it("accepts a rendered scan", () => {
    expect(himawariRgbSchema.safeParse(meta).success).toBe(true);
  });

  it("accepts a failure record that kept no image", () => {
    const failed = { ...meta, scanTime: null, image: null, width: undefined, height: undefined, error: "HTTPError: 503" };
    expect(himawariRgbSchema.safeParse(failed).success).toBe(true);
  });

  it("rejects bounds that are not numbers and a bad scan time", () => {
    expect(himawariRgbSchema.safeParse({ ...meta, bounds: { ...meta.bounds, west: "99" } }).success).toBe(false);
    expect(himawariRgbSchema.safeParse({ ...meta, scanTime: "today" }).success).toBe(false);
  });
});
