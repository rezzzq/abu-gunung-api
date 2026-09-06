import { describe, expect, it } from "vitest";
import { formatRelative, formatWib, formatWibClock, parseDtg, resolveDayTime, toIso } from "../src/lib/time";

describe("parseDtg", () => {
  it("parses YYYYMMDD/HHMMZ", () => {
    expect(toIso(parseDtg("20260906/0030Z")!)).toBe("2026-09-06T00:30:00Z");
  });

  it("returns null on garbage", () => {
    expect(parseDtg("soon")).toBeNull();
  });
});

describe("resolveDayTime", () => {
  const ref = new Date("2026-09-06T00:30:00Z");

  it("resolves within the same month", () => {
    expect(toIso(resolveDayTime("06/0010Z", ref)!)).toBe("2026-09-06T00:10:00Z");
  });

  it("forecast into next month picks the closest instant", () => {
    const eom = new Date("2026-09-30T23:30:00Z");
    expect(toIso(resolveDayTime("01/1730Z", eom)!)).toBe("2026-10-01T17:30:00Z");
  });

  it("observation from previous month at start of month", () => {
    const som = new Date("2026-10-01T00:20:00Z");
    expect(toIso(resolveDayTime("30/2350Z", som)!)).toBe("2026-09-30T23:50:00Z");
  });

  it("skips months where the day does not exist", () => {
    const ref31 = new Date("2026-10-31T23:00:00Z");
    expect(toIso(resolveDayTime("31/2300Z", ref31)!)).toBe("2026-10-31T23:00:00Z");
  });

  it("returns null for a bad token", () => {
    expect(resolveDayTime("late", ref)).toBeNull();
    expect(resolveDayTime("06/2560Z", ref)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats WIB in Indonesian", () => {
    expect(formatWib("2026-09-06T00:10:00Z", "id")).toMatch(/6 Sep 2026.*07[.:]10 WIB/);
  });

  it("formats WIB in English", () => {
    expect(formatWib("2026-09-06T00:10:00Z", "en")).toMatch(/6 Sept? 2026.*07[.:]10 WIB/);
  });

  it("formats the WIB clock", () => {
    expect(formatWibClock("2026-09-06T00:10:00Z")).toMatch(/^07[.:]10$/);
  });

  it("relative minutes, hours and days", () => {
    const now = new Date("2026-09-06T03:00:00Z");
    expect(formatRelative("2026-09-06T02:48:00Z", now, "id")).toBe("12 mnt lalu");
    expect(formatRelative("2026-09-06T00:00:00Z", now, "en")).toBe("3 h ago");
    expect(formatRelative("2026-09-04T00:00:00Z", now, "id")).toBe("2 hr lalu");
    expect(formatRelative("2026-09-06T03:05:00Z", now, "en")).toBe("0 min ago");
  });
});
