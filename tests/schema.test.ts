import { describe, expect, it } from "vitest";
import { latestDataSchema, layerSchema } from "../src/lib/schema";

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
  volcano: { name: "x", lat: -6.1, lon: 105.4, elevationM: 155 },
  vaac: null,
  magma: null,
  satellite: null,
  sourceErrors: [],
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

  it("rejects an activity level outside 1-4", () => {
    const r = latestDataSchema.safeParse({
      ...minimalDoc,
      magma: { fetchedAt: "2026-09-06T02:00:00Z", activityLevel: { level: 5, name: "x" }, latestVona: null },
    });
    expect(r.success).toBe(false);
  });
});
