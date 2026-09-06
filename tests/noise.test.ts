import { describe, expect, it } from "vitest";
import { noiseTile } from "../src/lib/noise";

describe("noiseTile", () => {
  const size = 64;
  const tile = noiseTile(size, { octaves: 4, seed: 7 });

  it("returns one byte per pixel spanning the full 0..255 range", () => {
    expect(tile.length).toBe(size * size);
    expect(Math.min(...tile)).toBe(0);
    expect(Math.max(...tile)).toBe(255);
  });

  it("is deterministic for a seed and different across seeds", () => {
    expect(noiseTile(size, { octaves: 4, seed: 7 })).toEqual(tile);
    expect(noiseTile(size, { octaves: 4, seed: 8 })).not.toEqual(tile);
  });

  it("wraps seamlessly so the texture can repeat", () => {
    // Opposite edges must be as close as neighbouring pixels are, in both directions.
    const at = (x: number, y: number): number => tile[y * size + x]!;
    let wrapDiff = 0;
    let neighbourDiff = 0;
    for (let i = 0; i < size; i++) {
      wrapDiff += Math.abs(at(0, i) - at(size - 1, i)) + Math.abs(at(i, 0) - at(i, size - 1));
      neighbourDiff += Math.abs(at(1, i) - at(2, i)) + Math.abs(at(i, 1) - at(i, 2));
    }
    expect(wrapDiff).toBeLessThan(neighbourDiff * 2 + size);
  });

  it("is smooth: neighbouring pixels differ far less than the full range", () => {
    let maxStep = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 1; x < size; x++) maxStep = Math.max(maxStep, Math.abs(tile[y * size + x]! - tile[y * size + x - 1]!));
    }
    expect(maxStep).toBeLessThan(64);
  });
});
