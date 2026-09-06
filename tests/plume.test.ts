import { describe, expect, it } from "vitest";
import { driftVector, plumeDriftDeg } from "../src/lib/plume";
import type { WindReport } from "../src/lib/wind-report";

describe("driftVector", () => {
  it("maps a compass bearing to screen space with north pointing up", () => {
    expect(driftVector(0)).toEqual({ x: 0, y: -1 });
    expect(driftVector(90)).toEqual({ x: 1, y: 0 });
    expect(driftVector(180)).toEqual({ x: 0, y: 1 });
    expect(driftVector(270)).toEqual({ x: -1, y: 0 });
  });

  it("returns a unit vector for diagonal bearings", () => {
    const v = driftVector(45);
    expect(v.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(v.y).toBeCloseTo(-Math.SQRT1_2, 6);
  });
});

describe("plumeDriftDeg", () => {
  const level = (key: WindReport["levels"][number]["key"], approxKm: number, fromDeg: number) => ({
    key,
    approxKm,
    speedKmh: 20,
    fromDeg,
  });

  it("drifts with the highest available wind level", () => {
    const report: WindReport = {
      time: "2026-09-06T03:00Z",
      levels: [level("surface", 0, 140), level("mid", 5.5, 126), level("high", 10.5, 68)],
    };
    expect(plumeDriftDeg(report)).toBe(248);
  });

  it("falls back to the tallest level that has data", () => {
    const report: WindReport = { time: "2026-09-06T03:00Z", levels: [level("low", 1.5, 90), level("surface", 0, 0)] };
    expect(plumeDriftDeg(report)).toBe(270);
  });

  it("returns null without a wind report or without levels", () => {
    expect(plumeDriftDeg(null)).toBeNull();
    expect(plumeDriftDeg({ time: "2026-09-06T03:00Z", levels: [] })).toBeNull();
  });
});
