import { describe, expect, it } from "vitest";
import { closeRing, distanceKm, layersContaining } from "../src/lib/geo";
import type { AshLayer } from "../src/lib/schema";

const layer: AshLayer = {
  baseFl: 0,
  topFl: 200,
  polygon: [
    [104, -5],
    [107, -5],
    [107, -8],
    [104, -8],
  ],
  movement: null,
};

describe("geo", () => {
  it("closeRing repeats the first point once", () => {
    const closed = closeRing(layer.polygon);
    expect(closed.at(-1)).toEqual([104, -5]);
    expect(closeRing(closed)).toHaveLength(closed.length);
    expect(closeRing([])).toEqual([]);
  });

  it("detects containment", () => {
    expect(layersContaining(105.4, -6.1, [layer])).toHaveLength(1);
    expect(layersContaining(110, -6.1, [layer])).toHaveLength(0);
  });

  it("distance Jakarta to volcano is about 155 km", () => {
    const d = distanceKm(106.8456, -6.2088, 105.423, -6.102);
    expect(d).toBeGreaterThan(140);
    expect(d).toBeLessThan(165);
  });
});
