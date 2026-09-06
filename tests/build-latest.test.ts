import { describe, expect, it } from "vitest";
import { buildLatest, extractLatestFrameTime } from "../src/lib/build-latest";
import type { TaggedAdvisory } from "../src/lib/build-latest";
import type { Advisory, LatestData } from "../src/lib/schema";

const now = new Date("2026-09-06T10:00:00Z");
const triangle: [number, number][] = [[105, -6], [106, -6], [106, -7]];

function advisory(volcano: string, issuedAt: string, topFl: number | null, extra: Partial<Advisory> = {}): Advisory {
  return {
    header: `FVAU04 ADRM ${issuedAt.slice(8, 10)}${issuedAt.slice(11, 13)}${issuedAt.slice(14, 16)}`,
    issuedAt,
    volcano,
    area: "INDONESIA",
    position: null,
    elevationM: null,
    advisoryNumber: null,
    infoSource: null,
    eruptionDetails: null,
    remarks: null,
    nextAdvisoryBy: "2026-09-06T16:00:00Z",
    observation: topFl === null ? null : { kind: "OBS", time: issuedAt, layers: [{ baseFl: 0, topFl, polygon: triangle, movement: null }] },
    forecasts: [],
    raw: "",
    ...extra,
  };
}

const krakatauOld = advisory("KRAKATAU 262000", "2026-09-06T03:30:00Z", 300);
const krakatau = advisory("KRAKATAU 262000", "2026-09-06T09:10:00Z", 500, { position: { lat: -6.1, lon: 105.4167 }, elevationM: 155 });
const semeru = advisory("SEMERU 263300", "2026-09-06T06:00:00Z", 150, { position: { lat: -8.1, lon: 112.9167 }, elevationM: 3657 });
const sinabung = advisory("SINABUNG 261080", "2026-09-05T04:42:00Z", null, {
  position: { lat: 3.1667, lon: 98.4 },
  nextAdvisoryBy: null,
  raw: "NXT ADVISORY: NO FURTHER ADVISORIES=",
});
const nowhere = advisory("MOUNT NOWHERE 999999", "2026-09-06T08:00:00Z", 100);

const magmaOk = {
  status: "ok" as const,
  value: {
    levels: new Map([
      ["Anak Krakatau", { level: 3, name: "Siaga" }],
      ["Semeru", { level: 3, name: "Siaga" }],
      ["Sinabung", { level: 3, name: "Siaga" }],
      ["Merapi", { level: 3, name: "Siaga" }],
      ["Gunung Fiktif", { level: 4, name: "Awas" }],
      ["Dukono", { level: 2, name: "Waspada" }],
    ]),
    vonas: [
      { volcano: "Semeru", time: "2026-09-06T08:49:00Z", colorCode: "Orange", title: "Semeru - 20260906/0849Z", text: "Eruption", url: null },
      { volcano: "Semeru", time: "2026-09-06T06:39:00Z", colorCode: "Orange", title: "Semeru - 20260906/0639Z", text: "Older", url: null },
    ],
  },
};
const satOk = { status: "ok" as const, value: { layer: "L", latestFrameTime: null } };
const metarsOk = {
  status: "ok" as const,
  value: [
    { icao: "WIII", raw: "METAR WIII 061300Z 03005KT 7000 VA SCT020 28/21 Q1014 NOSIG" },
    { icao: "WARR", raw: "METAR WARR 061300Z 12008KT 4000 HZ FEW020 27/22 Q1014 NOSIG" },
  ],
};
const tag = (advs: Advisory[], source: "noaa" | "bom" = "noaa"): TaggedAdvisory[] =>
  advs.map((advisory) => ({ advisory, source, graphic: null }));
const base = {
  now,
  vaacPartialFailures: [] as string[],
  magma: magmaOk,
  satellite: satOk,
  metars: metarsOk,
  notams: { status: "skipped" as const },
  previous: null,
};

describe("buildLatest", () => {
  it("lists one entry per volcano, newest advisory each, active ones first by ash top", () => {
    const d = buildLatest({ ...base, advisories: { status: "ok", value: tag([semeru, krakatauOld, krakatau]) } });
    // Sinabung and Merapi are Level III in the MAGMA snapshot, so they follow as markers.
    expect(d.volcanoes.map((v) => v.id)).toEqual(["KRA", "SMR", "MER", "SIN"]);
    const kra = d.volcanoes[0]!;
    expect(kra.vaac?.header).toBe(krakatau.header);
    expect(kra).toMatchObject({ name: "Anak Krakatau", lat: -6.1, lon: 105.4167, elevationM: 155, active: true, region: "Selat Sunda" });
    expect(kra.activityLevel).toEqual({ level: 3, name: "Siaga" });
    expect(d.volcanoes[1]?.latestVona?.time).toBe("2026-09-06T08:49:00Z");
    expect(d.generatedAt).toBe("2026-09-06T10:00:00Z");
  });

  it("keeps a terminated or stale advisory but marks the volcano inactive", () => {
    const stale = advisory("DUKONO 268010", "2026-09-04T07:00:00Z", 70, { position: { lat: 1.7, lon: 127.9 } });
    const d = buildLatest({ ...base, advisories: { status: "ok", value: tag([sinabung, stale]) } });
    const sin = d.volcanoes.find((v) => v.id === "SIN");
    expect(sin?.active).toBe(false);
    expect(sin?.vaac?.header).toBe(sinabung.header);
    // Dukono is Level II and its advisory is stale, so it drops out entirely.
    expect(d.volcanoes.find((v) => v.id === "DUK")).toBeUndefined();
  });

  it("adds Level III and IV volcanoes without an advisory as markers, positioned from the table", () => {
    const d = buildLatest({ ...base, advisories: { status: "ok", value: tag([]) } });
    const ids = d.volcanoes.map((v) => v.id);
    expect(ids).toContain("MER");
    expect(ids).toContain("SIN");
    const mer = d.volcanoes.find((v) => v.id === "MER")!;
    expect(mer).toMatchObject({ vaac: null, active: false, lat: -7.54, lon: 110.446 });
    expect(d.sourceErrors.some((e) => /Gunung Fiktif/.test(e))).toBe(true);
  });

  it("skips an unknown volcano whose advisory has no position and says so", () => {
    const d = buildLatest({ ...base, advisories: { status: "ok", value: tag([nowhere]) } });
    expect(d.volcanoes.find((v) => v.name === "Mount Nowhere")).toBeUndefined();
    expect(d.sourceErrors.some((e) => /Mount Nowhere/.test(e))).toBe(true);
  });

  it("keeps the previous volcano list when the VAAC fetch failed", () => {
    const previous: LatestData = buildLatest({ ...base, advisories: { status: "ok", value: tag([krakatau]) } });
    const d = buildLatest({ ...base, previous, advisories: { status: "failed", error: "timeout" } });
    expect(d.volcanoes.map((v) => v.id)).toEqual(previous.volcanoes.map((v) => v.id));
    expect(d.sourceErrors[0]).toMatch(/kept previous/);
  });

  it("keeps previous levels and VONAs when MAGMA failed", () => {
    const previous: LatestData = buildLatest({ ...base, advisories: { status: "ok", value: tag([krakatau, semeru]) } });
    const d = buildLatest({ ...base, previous, advisories: { status: "ok", value: tag([krakatau, semeru]) }, magma: { status: "failed", error: "HTTP 403" } });
    expect(d.volcanoes.find((v) => v.id === "SMR")?.latestVona?.time).toBe("2026-09-06T08:49:00Z");
    expect(d.volcanoes.find((v) => v.id === "KRA")?.activityLevel?.level).toBe(3);
    expect(d.magmaFetchedAt).toBeNull();
    expect(d.sourceErrors).toContain("magma: HTTP 403");
  });

  it("records partial VAAC failures and a satellite failure", () => {
    const d = buildLatest({
      ...base,
      vaacPartialFailures: ["fvau07.adrm..txt: HTTP 404"],
      advisories: { status: "ok", value: tag([krakatau]) },
      satellite: { status: "failed", error: "timeout" },
    });
    expect(d.satellite).toBeNull();
    expect(d.sourceErrors.filter((e) => !/Gunung Fiktif/.test(e))).toEqual(["vaac: fvau07.adrm..txt: HTTP 404", "satellite: timeout"]);
  });
});

describe("buildLatest sources, history and checks", () => {
  it("prefers the newer advisory when both sources carry the volcano and notes the lag", () => {
    const d = buildLatest({ ...base, advisories: { status: "ok", value: [...tag([krakatauOld], "noaa"), ...tag([krakatau], "bom")] } });
    const kra = d.volcanoes.find((v) => v.id === "KRA")!;
    expect(kra.vaac?.header).toBe(krakatau.header);
    expect(kra.advisorySource).toBe("bom");
    expect(d.notes).toEqual([expect.stringMatching(/KRA.*noaa .*03:30.*bom .*09:10/)]);
  });

  it("carries the BoM graphic and accumulates an advisory history across runs", () => {
    const first = buildLatest({ ...base, advisories: { status: "ok", value: [{ advisory: krakatauOld, source: "bom", graphic: "vag/KRA.png?v=202609060330" }] } });
    expect(first.volcanoes[0]?.graphic).toBe("vag/KRA.png?v=202609060330");
    expect(first.volcanoes[0]?.history).toEqual([{ number: null, issuedAt: "2026-09-06T03:30:00Z", topFl: 300, direction: null }]);
    const second = buildLatest({ ...base, previous: first, advisories: { status: "ok", value: tag([krakatau], "bom") } });
    expect(second.volcanoes[0]?.history.map((h) => h.issuedAt)).toEqual(["2026-09-06T09:10:00Z", "2026-09-06T03:30:00Z"]);
    const again = buildLatest({ ...base, previous: second, advisories: { status: "ok", value: tag([krakatau], "bom") } });
    expect(again.volcanoes[0]?.history).toHaveLength(2);
  });

  it("rejects an advisory that fails the sanity checks and keeps the previous one", () => {
    const previous = buildLatest({ ...base, advisories: { status: "ok", value: tag([krakatauOld]) } });
    const broken = advisory("KRAKATAU 262000", "2026-09-06T09:30:00Z", 500, {
      observation: { kind: "OBS", time: "2026-09-06T09:10:00Z", layers: [{ baseFl: 0, topFl: 500, polygon: [[10, 50], [11, 50], [11, 51]], movement: null }] },
    });
    const d = buildLatest({ ...base, previous, advisories: { status: "ok", value: tag([broken]) } });
    expect(d.volcanoes.find((v) => v.id === "KRA")?.vaac?.header).toBe(krakatauOld.header);
    expect(d.sourceErrors.filter((e) => e.startsWith("vaac:"))).toEqual([expect.stringMatching(/rejected .*KRAKATAU.*outside the Darwin area.*kept FVAU04 ADRM 060330/)]);
  });
});

describe("buildLatest airports", () => {
  it("lists every airport in the table, with its parsed report when one exists", () => {
    const d = buildLatest({ ...base, advisories: { status: "ok", value: tag([krakatau]) } });
    const cgk = d.airports.find((a) => a.icao === "WIII")!;
    expect(cgk).toMatchObject({ iata: "CGK", ash: true, visibilityM: 7000, observedAt: "2026-09-06T13:00:00Z" });
    const bdo = d.airports.find((a) => a.icao === "WICC")!;
    expect(bdo).toMatchObject({ iata: "BDO", ash: false, visibilityM: null, observedAt: null, raw: null });
    expect(d.airports.length).toBeGreaterThan(10);
  });

  it("attaches NOTAM facts when the API answered and keeps them when it later fails", () => {
    const notam = { closed: true, closedUntil: "2026-09-06T16:00:00Z", ashNotam: true, notams: [] };
    const withNotam = buildLatest({ ...base, advisories: { status: "ok", value: tag([krakatau]) }, notams: { status: "ok", value: [{ icao: "WIII", status: notam }] } });
    expect(withNotam.airports.find((a) => a.icao === "WIII")?.notam).toEqual(notam);
    expect(withNotam.airports.find((a) => a.icao === "WARR")?.notam).toBeNull();
    const later = buildLatest({ ...base, previous: withNotam, advisories: { status: "ok", value: tag([krakatau]) }, notams: { status: "failed", error: "HTTP 500" } });
    expect(later.airports.find((a) => a.icao === "WIII")?.notam?.closed).toBe(true);
    expect(later.sourceErrors.some((e) => e.startsWith("notam: kept previous"))).toBe(true);
  });

  it("keeps the previous reports when the METAR fetch failed", () => {
    const previous = buildLatest({ ...base, advisories: { status: "ok", value: tag([krakatau]) } });
    const d = buildLatest({ ...base, previous, advisories: { status: "ok", value: tag([krakatau]) }, metars: { status: "failed", error: "HTTP 503" } });
    expect(d.airports.find((a) => a.icao === "WIII")?.ash).toBe(true);
    expect(d.sourceErrors).toContain("metar: kept previous airport reports because fetch failed: HTTP 503");
  });
});

describe("extractLatestFrameTime", () => {
  const xml =
    "<Layer><ows:Identifier>Other</ows:Identifier><Dimension><Default>2026-01-01</Default></Dimension></Layer>" +
    "<Layer><ows:Identifier>L</ows:Identifier><Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-09-06T02:20:00Z</Default></Dimension></Layer>";

  it("reads the Default value of the layer's time dimension", () => {
    expect(extractLatestFrameTime(xml, "L")).toBe("2026-09-06T02:20:00Z");
  });

  it("returns null for a missing layer or a daily (non-time) default", () => {
    expect(extractLatestFrameTime(xml, "Missing")).toBeNull();
    expect(extractLatestFrameTime(xml, "Other")).toBeNull();
  });
});
