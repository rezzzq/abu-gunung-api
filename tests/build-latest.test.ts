import { describe, expect, it } from "vitest";
import { buildLatest, extractLatestFrameTime } from "../src/lib/build-latest";
import type { Advisory, LatestData } from "../src/lib/schema";

const adv: Advisory = {
  header: "FVAU04 ADRM 060030",
  issuedAt: "2026-09-06T00:30:00Z",
  volcano: "KRAKATAU 262000",
  advisoryNumber: "2026/183",
  infoSource: null,
  eruptionDetails: null,
  remarks: null,
  nextAdvisoryBy: null,
  observation: null,
  forecasts: [],
  raw: "",
};
const now = new Date("2026-09-06T03:00:00Z");
const magmaOk = {
  status: "ok" as const,
  value: { fetchedAt: "2026-09-06T03:00:00Z", activityLevel: { level: 3, name: "Siaga" }, latestVona: null },
};
const satOk = { status: "ok" as const, value: { layer: "L", latestFrameTime: null } };
const base = { now, vaacPartialFailures: [] as string[], magma: magmaOk, satellite: satOk, previous: null };
const previous: LatestData = {
  generatedAt: "2026-09-06T02:00:00Z",
  volcano: { name: "x", lat: 0, lon: 0, elevationM: 0 },
  vaac: adv,
  magma: null,
  satellite: null,
  sourceErrors: [],
};

describe("buildLatest", () => {
  it("uses the fresh advisory and stamps generatedAt", () => {
    const d = buildLatest({ ...base, vaac: { status: "ok", value: adv } });
    expect(d.vaac?.header).toBe(adv.header);
    expect(d.generatedAt).toBe("2026-09-06T03:00:00Z");
    expect(d.volcano.name).toBe("Anak Krakatau");
    expect(d.sourceErrors).toEqual([]);
  });

  it("keeps the previous advisory when the vaac fetch failed", () => {
    const d = buildLatest({ ...base, previous, vaac: { status: "failed", error: "timeout" } });
    expect(d.vaac?.header).toBe(adv.header);
    expect(d.sourceErrors[0]).toMatch(/kept previous/);
  });

  it("reports the failure when the fetch failed and there is nothing to keep", () => {
    const d = buildLatest({ ...base, vaac: { status: "failed", error: "timeout" } });
    expect(d.vaac).toBeNull();
    expect(d.sourceErrors).toEqual(["vaac: timeout"]);
  });

  it("keeps the previous advisory when none was found but some files failed", () => {
    const d = buildLatest({
      ...base,
      previous,
      vaacPartialFailures: ["fvau04.adrm..txt: HTTP 503"],
      vaac: { status: "ok", value: null },
    });
    expect(d.vaac?.header).toBe(adv.header);
    expect(d.sourceErrors[0]).toMatch(/HTTP 503/);
  });

  it("clears the advisory when all files fetched and none is Krakatau", () => {
    const d = buildLatest({ ...base, previous, vaac: { status: "ok", value: null } });
    expect(d.vaac).toBeNull();
    expect(d.sourceErrors).toEqual([]);
  });

  it("passes partial failures through when a fresh advisory exists", () => {
    const d = buildLatest({ ...base, vaacPartialFailures: ["fvau07.adrm..txt: HTTP 404"], vaac: { status: "ok", value: adv } });
    expect(d.vaac?.header).toBe(adv.header);
    expect(d.sourceErrors).toEqual(["vaac: fvau07.adrm..txt: HTTP 404"]);
  });

  it("records magma and satellite failures and still validates", () => {
    const d = buildLatest({
      ...base,
      vaac: { status: "ok", value: adv },
      magma: { status: "failed", error: "HTTP 403" },
      satellite: { status: "failed", error: "timeout" },
    });
    expect(d.magma).toBeNull();
    expect(d.satellite).toBeNull();
    expect(d.sourceErrors).toEqual(["magma: HTTP 403", "satellite: timeout"]);
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
