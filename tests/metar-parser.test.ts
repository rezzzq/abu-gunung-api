import { describe, expect, it } from "vitest";
import { parseMetar } from "../src/lib/metar-parser";

const ref = new Date("2026-09-06T13:20:00Z");

describe("parseMetar", () => {
  it("reads time, visibility in metres and volcanic ash", () => {
    const m = parseMetar("METAR WIII 061300Z 03005KT 7000 VA SCT020 28/21 Q1014 NOSIG", ref);
    expect(m).toEqual({ icao: "WIII", time: "2026-09-06T13:00:00Z", visibilityM: 7000, weather: ["VA"], ash: true });
  });

  it("treats 9999 and CAVOK as 10 km or more and lists other weather", () => {
    expect(parseMetar("METAR WILL 061300Z 15007KT 120V190 9999 VA FEW020 27/19 Q1014", ref)?.visibilityM).toBe(10000);
    const haze = parseMetar("METAR WARR 061300Z 12008KT 4000 HZ FEW020 27/22 Q1014 NOSIG", ref);
    expect(haze).toMatchObject({ visibilityM: 4000, weather: ["HZ"], ash: false });
    expect(parseMetar("METAR WADD 061300Z 13007KT CAVOK 26/24 Q1016", ref)?.visibilityM).toBe(10000);
  });

  it("counts blowing or nearby ash as ash and ignores the remarks section", () => {
    expect(parseMetar("METAR WIHH 061300Z 05003KT 8000 BLVA SCT018 29/19 Q1014", ref)?.ash).toBe(true);
    expect(parseMetar("METAR WIHH 061300Z 05003KT 8000 VCVA SCT018 29/19 Q1014", ref)?.ash).toBe(true);
    expect(parseMetar("METAR WIHH 061300Z 05003KT 8000 SCT018 29/19 Q1014 RMK VA REPORTED EARLIER", ref)?.ash).toBe(false);
  });

  it("resolves the day-of-month against the reference date, across a month boundary", () => {
    const m = parseMetar("METAR WIII 302350Z 00000KT 9999 FEW020 25/22 Q1012", new Date("2026-10-01T00:10:00Z"));
    expect(m?.time).toBe("2026-09-30T23:50:00Z");
  });

  it("returns null for text that is not a METAR", () => {
    expect(parseMetar("TAF WIII 061100Z 0612/0718 03005KT 9999 SCT020", ref)).toBeNull();
    expect(parseMetar("", ref)).toBeNull();
  });
});
