import { describe, expect, it } from "vitest";
import { himawariSchema, latestDataSchema, layerSchema } from "../src/lib/schema";

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

describe("himawariSchema", () => {
  const meta = {
    generatedAt: "2026-09-06T11:00:02Z",
    scanTime: "2026-09-06T10:40:00Z",
    bounds: { west: 95, south: -12, east: 131, north: 7 },
    width: 2004,
    height: 1063,
    source: "Himawari-9 AHI via NOAA Open Data",
    rgb: { image: "ash-rgb.webp", error: null },
    truecolor: { image: null, error: "night" },
    signal: { image: "ash-signal.webp", error: null, referenceDays: ["2026-09-05", "2026-09-04"], stats: { keptPixels: 3134, blobsKept: 71 } },
  };

  it("fills in the true colour block for older sidecars", () => {
    const { truecolor: _t, ...older } = meta;
    const parsed = himawariSchema.safeParse(older);
    expect(parsed.success && parsed.data.truecolor).toEqual({ image: null, error: null });
  });

  it("accepts a rendered scan with both products", () => {
    expect(himawariSchema.safeParse(meta).success).toBe(true);
  });

  it("accepts a failed signal next to a good RGB, and a failed run with no images", () => {
    const partial = { ...meta, signal: { image: null, error: "RuntimeError: no reference scan", referenceDays: [], stats: null } };
    expect(himawariSchema.safeParse(partial).success).toBe(true);
    const failed = { ...meta, scanTime: null, width: null, height: null, rgb: { image: null, error: "HTTPError: 503" }, signal: { image: null, error: null } };
    expect(himawariSchema.safeParse(failed).success).toBe(true);
  });

  it("rejects bounds that are not numbers and a bad scan time", () => {
    expect(himawariSchema.safeParse({ ...meta, bounds: { ...meta.bounds, west: "95" } }).success).toBe(false);
    expect(himawariSchema.safeParse({ ...meta, scanTime: "today" }).success).toBe(false);
  });
});
