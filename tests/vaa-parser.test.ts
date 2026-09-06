import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isTerminated,
  latestAdvisoryFor,
  parseAdvisory,
  parseAllAdvisories,
  parseCoordinate,
  parseFields,
  parseLayers,
  splitBulletins,
} from "../src/lib/vaa-parser";

const krakatau = readFileSync(new URL("./fixtures/fvau04-krakatau.txt", import.meta.url), "utf8");
const semeru = readFileSync(new URL("./fixtures/fvau02-semeru.txt", import.meta.url), "utf8");

describe("parseCoordinate", () => {
  it("converts DDMM south and DDDMM east", () => {
    expect(parseCoordinate("S0606")).toBeCloseTo(-6.1, 4);
    expect(parseCoordinate("E10525")).toBeCloseTo(105.4167, 3);
  });

  it("handles north and west", () => {
    expect(parseCoordinate("N0530")).toBeCloseTo(5.5, 4);
    expect(parseCoordinate("W07030")).toBeCloseTo(-70.5, 4);
  });

  it("handles decimal minutes", () => {
    expect(parseCoordinate("S0630.5")).toBeCloseTo(-6.5083, 3);
  });

  it("rejects nonsense and wrong digit counts", () => {
    expect(parseCoordinate("X12")).toBeNull();
    expect(parseCoordinate("S10525")).toBeNull();
    expect(parseCoordinate("E0606")).toBeNull();
    expect(parseCoordinate("S0675")).toBeNull();
  });
});

describe("parseFields", () => {
  it("joins continuation lines and strips trailing =", () => {
    const f = parseFields(krakatau);
    expect(f.get("VOLCANO")).toBe("KRAKATAU 262000");
    expect(f.get("OBS VA CLD")).toContain("MOV W 30KT");
    expect(f.get("OBS VA CLD")).not.toMatch(/\s{2,}/);
    expect(f.get("NXT ADVISORY")).toBe("NO LATER THAN 20260906/0330Z");
    expect(f.get("FCST VA CLD +6 HR")).toMatch(/^06\/0610Z SFC\/FL200/);
  });
});

describe("parseLayers", () => {
  it("parses two layers with movement", () => {
    const layers = parseLayers(
      "SFC/FL200 S0504 E10700 - S0641 E11007 - S0901 E10914 MOV E 10KT SFC/FL500 S0714 E10617 - S1031 E10025 - S1731 E09640 - S1203 E07906 MOV W 30KT",
    );
    expect(layers).toHaveLength(2);
    expect(layers[0]).toMatchObject({ baseFl: 0, topFl: 200, movement: { direction: "E", speedKt: 10 } });
    expect(layers[0]!.polygon[0]).toEqual([107, -5.0667]);
    expect(layers[1]).toMatchObject({ baseFl: 0, topFl: 500, movement: { direction: "W", speedKt: 30 } });
    expect(layers[1]!.polygon).toHaveLength(4);
  });

  it("parses FL/FL layers without movement", () => {
    const layers = parseLayers("FL200/FL350 S0600 E10500 - S0630 E10530 - S0700 E10500");
    expect(layers[0]).toMatchObject({ baseFl: 200, topFl: 350, movement: null });
  });

  it("returns no layers for not identifiable or no VA expected", () => {
    expect(parseLayers("VA NOT IDENTIFIABLE FM SATELLITE DATA WIND SFC/FL100 090/10KT")).toEqual([]);
    expect(parseLayers("NO VA EXP")).toEqual([]);
  });

  it("drops a layer with fewer than three points", () => {
    expect(parseLayers("SFC/FL100 S0600 E10500 - S0630 E10530")).toEqual([]);
  });
});

describe("parseAdvisory", () => {
  it("parses the real Krakatau bulletin", () => {
    const r = parseAdvisory(krakatau);
    if (!r.ok) throw new Error(r.reason);
    const a = r.advisory;
    expect(a.header).toBe("FVAU04 ADRM 060030");
    expect(a.issuedAt).toBe("2026-09-06T00:30:00Z");
    expect(a.volcano).toBe("KRAKATAU 262000");
    expect(a.advisoryNumber).toBe("2026/183");
    expect(a.infoSource).toBe("HIMAWARI-9 CVGHM");
    expect(a.eruptionDetails).toBe("VA TO FL500 MOV W, VA TO FL200 MOV E");
    expect(a.observation?.kind).toBe("OBS");
    expect(a.observation?.time).toBe("2026-09-06T00:10:00Z");
    expect(a.observation?.layers).toHaveLength(2);
    expect(a.observation?.layers[1]?.polygon).toHaveLength(7);
    expect(a.forecasts.map((f) => f.hoursAhead)).toEqual([6, 12, 18]);
    expect(a.forecasts[0]?.time).toBe("2026-09-06T06:10:00Z");
    expect(a.forecasts[2]?.time).toBe("2026-09-06T18:10:00Z");
    expect(a.forecasts[2]?.layers[1]?.topFl).toBe(500);
    expect(a.nextAdvisoryBy).toBe("2026-09-06T03:30:00Z");
    expect(a.remarks).toContain("DISPERSION MODELS");
    expect(a.raw).toBe(krakatau.trim());
  });

  it("parses an EST advisory (Semeru)", () => {
    const r = parseAdvisory(semeru);
    if (!r.ok) throw new Error(r.reason);
    expect(r.advisory.observation?.kind).toBe("EST");
    expect(r.advisory.observation?.time).toBe("2026-09-05T23:40:00Z");
    expect(r.advisory.observation?.layers[0]?.movement).toEqual({ direction: "SE", speedKt: 5 });
  });

  it("fails without DTG", () => {
    const r = parseAdvisory("FVAU09 ADRM 060000\nVA ADVISORY\nVOLCANO: KRAKATAU 262000\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/DTG/);
  });

  it("fails without volcano", () => {
    const r = parseAdvisory("FVAU09 ADRM 060000\nVA ADVISORY\nDTG: 20260906/0000Z\n");
    expect(r.ok).toBe(false);
  });

  it("uses issue time plus hours when a forecast has no time token", () => {
    const r = parseAdvisory(
      "FVAU09 ADRM 060000\nVA ADVISORY\nDTG: 20260906/0000Z\nVOLCANO: TEST 1\nFCST VA CLD +6 HR: NO VA EXP\n",
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.advisory.forecasts[0]).toMatchObject({ hoursAhead: 6, time: "2026-09-06T06:00:00Z", layers: [] });
    expect(r.advisory.observation).toBeNull();
  });

  it("falls back to issue time when the observation has no DTG", () => {
    const r = parseAdvisory(
      "FVAU09 ADRM 060000\nVA ADVISORY\nDTG: 20260906/0000Z\nVOLCANO: TEST 1\nOBS VA CLD: SFC/FL100 S0600 E10500 - S0630 E10530 - S0700 E10500\n",
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.advisory.observation?.time).toBe("2026-09-06T00:00:00Z");
    expect(r.advisory.observation?.layers).toHaveLength(1);
  });
});

describe("parseAllAdvisories and latestAdvisoryFor", () => {
  it("splits concatenated bulletins and picks the newest Krakatau one", () => {
    const older = krakatau
      .replace("DTG: 20260906/0030Z", "DTG: 20260905/1830Z")
      .replace("FVAU04 ADRM 060030", "FVAU04 ADRM 051830");
    const text = `${older}\n\n${semeru}\n\n${krakatau}\n\nFVAU07 ADRM 060000\nVA ADVISORY\nVOLCANO: BROKEN\n`;
    const { advisories, failures } = parseAllAdvisories(text);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.header).toBe("FVAU07 ADRM 060000");
    expect(advisories).toHaveLength(3);
    expect(latestAdvisoryFor(advisories, /KRAKATAU/i)?.issuedAt).toBe("2026-09-06T00:30:00Z");
    expect(latestAdvisoryFor(advisories, /MERAPI/i)).toBeNull();
  });

  it("splitBulletins ignores blank leading text and empty input", () => {
    expect(splitBulletins(`\n\n${semeru}`)).toHaveLength(1);
    expect(splitBulletins("")).toEqual([]);
  });
});

describe("position, elevation and termination", () => {
  it("reads the source position and elevation from the bulletin", () => {
    const r = parseAdvisory(splitBulletins(krakatau)[0]!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.advisory.position).toEqual({ lat: -6.1, lon: 105.4167 });
    expect(r.advisory.elevationM).toBe(155);
    expect(isTerminated(r.advisory)).toBe(false);
  });

  it("flags a final advisory as terminated", () => {
    const bulletin = `FVAU05 ADRM 050442
VA ADVISORY
DTG: 20260905/0442Z
VAAC: DARWIN
VOLCANO: SINABUNG 261080
PSN: N0310 E09824
AREA: INDONESIA
SOURCE ELEV: 2460M AMSL
ADVISORY NR: 2026/25
INFO SOURCE: HIMAWARI-9
ERUPTION DETAILS: VA OBS TO FL140 MOV E AT 04/0430Z
EST VA DTG: 05/0445Z
EST VA CLD: VA NOT IDENTIFIABLE FM SATELLITE DATA WIND SFC/FL140 190/05KT
FCST VA CLD +6 HR: 05/1045Z NO VA EXP
FCST VA CLD +12 HR: 05/1645Z NO VA EXP
FCST VA CLD +18 HR: 05/2245Z NO VA EXP
RMK: VA NOT IDENTIFIABLE ON RECENT SATELLITE IMAGERY. ADVISORY TERMINATED.
NXT ADVISORY: NO FURTHER ADVISORIES=`;
    const r = parseAdvisory(bulletin);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.advisory.position).toEqual({ lat: 3.1667, lon: 98.4 });
    expect(r.advisory.elevationM).toBe(2460);
    expect(r.advisory.nextAdvisoryBy).toBeNull();
    expect(isTerminated(r.advisory)).toBe(true);
  });
});
