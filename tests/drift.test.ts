import { describe, expect, it } from "vitest";
import { compassToBearing, driftVector, layerDriftDeg, windDriftDeg } from "../src/lib/drift";
import type { AshLayer } from "../src/lib/schema";
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

describe("compassToBearing", () => {
  it("knows the 16 compass points", () => {
    expect(compassToBearing("N")).toBe(0);
    expect(compassToBearing("E")).toBe(90);
    expect(compassToBearing("WSW")).toBe(247.5);
    expect(compassToBearing("NNW")).toBe(337.5);
  });

  it("ignores case and surrounding space, and rejects unknown text", () => {
    expect(compassToBearing(" sw ")).toBe(225);
    expect(compassToBearing("WEST")).toBeNull();
    expect(compassToBearing("")).toBeNull();
  });
});

const level = (key: WindReport["levels"][number]["key"], approxKm: number, fromDeg: number) => ({
  key,
  approxKm,
  speedKmh: 20,
  fromDeg,
});
const wind: WindReport = {
  time: "2026-09-06T03:00Z",
  levels: [level("surface", 0, 140), level("mid", 5.5, 126), level("high", 10.5, 68)],
};
const layer = (movement: AshLayer["movement"]): AshLayer => ({ baseFl: 0, topFl: 200, polygon: [[105, -6], [106, -6], [106, -7]], movement });

describe("windDriftDeg", () => {
  it("drifts with the highest available wind level", () => {
    expect(windDriftDeg(wind)).toBe(248);
  });

  it("returns null without a wind report or without levels", () => {
    expect(windDriftDeg(null)).toBeNull();
    expect(windDriftDeg({ time: "2026-09-06T03:00Z", levels: [] })).toBeNull();
  });
});

describe("layerDriftDeg", () => {
  it("prefers the movement reported in the advisory", () => {
    expect(layerDriftDeg(layer({ direction: "W", speedKt: 10 }), wind)).toBe(270);
  });

  it("falls back to the wind when the advisory has no movement or an unknown direction", () => {
    expect(layerDriftDeg(layer(null), wind)).toBe(248);
    expect(layerDriftDeg(layer({ direction: "STNR", speedKt: 0 }), wind)).toBe(248);
  });

  it("returns null when neither source has a direction", () => {
    expect(layerDriftDeg(layer(null), null)).toBeNull();
  });
});
