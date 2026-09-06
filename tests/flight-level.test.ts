import { describe, expect, it } from "vitest";
import { flightLevelToFeet, flightLevelToMetres, formatAltitude, formatKm } from "../src/lib/flight-level";

describe("flight level", () => {
  it("FL500 is 50000 ft and 15240 m", () => {
    expect(flightLevelToFeet(500)).toBe(50000);
    expect(flightLevelToMetres(500)).toBe(15240);
  });

  it("formats id and en", () => {
    expect(formatAltitude(500, "id")).toBe("15,2 km (50.000 kaki)");
    expect(formatAltitude(200, "en")).toBe("6.1 km (20,000 ft)");
  });

  it("formats a short kilometre figure for headlines", () => {
    expect(formatKm(500, "id")).toBe("15,2 km");
    expect(formatKm(200, "en")).toBe("6.1 km");
  });
});
