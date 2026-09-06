import { describe, expect, it } from "vitest";
import { destinationPoint, pickWindReport, towardDeg } from "../src/lib/wind-report";

const raw = {
  hourly: {
    time: ["2026-09-06T02:00", "2026-09-06T03:00", "2026-09-06T04:00"],
    wind_speed_10m: [35.8, 35.5, 31.3],
    wind_direction_10m: [142, 140, 140],
    wind_speed_850hPa: [19.2, null, 20.0],
    wind_direction_850hPa: [62, 65, 66],
    wind_speed_500hPa: [12.9, 10.3, 11.1],
    wind_direction_500hPa: [112, 126, 131],
    wind_speed_250hPa: [69.8, 68.4, 66.9],
    wind_direction_250hPa: [71, 68, 69],
  },
};

describe("pickWindReport", () => {
  it("chooses the closest hour and skips levels with null values", () => {
    const r = pickWindReport(raw, new Date("2026-09-06T03:20:00Z"));
    expect(r?.time).toBe("2026-09-06T03:00Z");
    expect(r?.levels.map((l) => l.key)).toEqual(["surface", "mid", "high"]);
    expect(r?.levels[0]).toMatchObject({ speedKmh: 35.5, fromDeg: 140, approxKm: 0 });
  });

  it("returns null for an invalid payload", () => {
    expect(pickWindReport({ hourly: {} }, new Date())).toBeNull();
    expect(pickWindReport("nope", new Date())).toBeNull();
  });

  it("returns null when there are no hours", () => {
    const empty = { hourly: Object.fromEntries(Object.keys(raw.hourly).map((k) => [k, []])) };
    expect(pickWindReport(empty, new Date())).toBeNull();
  });
});

describe("towardDeg and destinationPoint", () => {
  it("ash moves opposite to where the wind comes from", () => {
    expect(towardDeg({ key: "surface", approxKm: 0, speedKmh: 1, fromDeg: 90 })).toBe(270);
    expect(towardDeg({ key: "surface", approxKm: 0, speedKmh: 1, fromDeg: 300 })).toBe(120);
  });

  it("moves roughly one degree of latitude per 111 km north", () => {
    const [lat, lon] = destinationPoint(-6.102, 105.423, 0, 111.2);
    expect(lat).toBeCloseTo(-5.102, 2);
    expect(lon).toBeCloseTo(105.423, 4);
  });

  it("moves east at the equator by about one degree per 111 km", () => {
    const [lat, lon] = destinationPoint(0, 100, 90, 111.2);
    expect(lat).toBeCloseTo(0, 5);
    expect(lon).toBeCloseTo(101, 2);
  });
});
