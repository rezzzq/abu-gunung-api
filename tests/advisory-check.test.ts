import { describe, expect, it } from "vitest";
import { advisoryProblems, isIndonesian, isStale } from "../src/lib/advisory-check";
import { maxDistanceKm, polygonAreaKm2 } from "../src/lib/geo";
import type { Advisory } from "../src/lib/schema";

const now = new Date("2026-09-06T12:00:00Z");
const square: [number, number][] = [[105, -6], [106, -6], [106, -7], [105, -7]];

function adv(overrides: Partial<Advisory> = {}): Advisory {
  return {
    header: "FVAU04 ADRM 061130",
    issuedAt: "2026-09-06T11:30:00Z",
    volcano: "KRAKATAU 262000",
    area: "INDONESIA",
    position: { lat: -6.1, lon: 105.4167 },
    elevationM: 155,
    advisoryNumber: "2026/188",
    infoSource: "HIMAWARI-9 CVGHM",
    eruptionDetails: "VA TO FL500 MOV SW",
    remarks: null,
    nextAdvisoryBy: "2026-09-06T14:30:00Z",
    observation: { kind: "OBS", time: "2026-09-06T11:10:00Z", layers: [{ baseFl: 0, topFl: 150, polygon: square, movement: null }] },
    forecasts: [],
    raw: "",
    ...overrides,
  };
}

describe("polygon geometry", () => {
  it("measures a one-degree square near the equator at about 12,300 km2", () => {
    expect(polygonAreaKm2(square)).toBeGreaterThan(12_000);
    expect(polygonAreaKm2(square)).toBeLessThan(12_600);
  });

  it("finds the farthest vertex from a point", () => {
    expect(maxDistanceKm(105, -6, square)).toBeGreaterThan(155);
    expect(maxDistanceKm(105, -6, square)).toBeLessThan(160);
  });
});

describe("advisoryProblems", () => {
  it("accepts a normal advisory", () => {
    expect(advisoryProblems(adv(), now)).toEqual([]);
  });

  it("flags polygons outside the Darwin area, inverted layers and impossible times", () => {
    const outside = adv({ observation: { kind: "OBS", time: "2026-09-06T11:10:00Z", layers: [{ baseFl: 0, topFl: 150, polygon: [[10, 50], [11, 50], [11, 51]], movement: null }] } });
    expect(advisoryProblems(outside, now)).toEqual([expect.stringMatching(/outside the Darwin area/)]);
    const inverted = adv({ observation: { kind: "OBS", time: "2026-09-06T11:10:00Z", layers: [{ baseFl: 200, topFl: 150, polygon: square, movement: null }] } });
    expect(advisoryProblems(inverted, now)).toEqual([expect.stringMatching(/top below base/)]);
    expect(advisoryProblems(adv({ issuedAt: "2026-09-09T00:00:00Z" }), now)).toEqual([expect.stringMatching(/issued .* in the future/)]);
    expect(isStale(adv({ issuedAt: "2026-09-02T00:00:00Z" }), now)).toBe(true);
    expect(isStale(adv(), now)).toBe(false);
    expect(isIndonesian(adv())).toBe(true);
    expect(isIndonesian(adv({ area: "VANUATU" }))).toBe(false);
    expect(isIndonesian(adv({ area: null }))).toBe(false);
  });

  it("flags an absurdly large polygon", () => {
    const huge = adv({ observation: { kind: "OBS", time: "2026-09-06T11:10:00Z", layers: [{ baseFl: 0, topFl: 150, polygon: [[70, 20], [170, 20], [170, -40], [70, -40]], movement: null }] } });
    expect(advisoryProblems(huge, now)).toEqual(expect.arrayContaining([expect.stringMatching(/too large/)]));
  });
});
