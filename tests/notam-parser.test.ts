import { describe, expect, it } from "vitest";
import { summarizeNotams } from "../src/lib/notam-parser";

const now = new Date("2026-09-06T13:30:00Z");

function item(overrides: Record<string, unknown>) {
  return {
    properties: {
      coreNOTAMData: {
        notam: {
          number: "A1234/26",
          icaoLocation: "WIII",
          effectiveStart: "2026-09-06T02:00:00.000Z",
          effectiveEnd: "2026-09-06T16:00:00.000Z",
          text: "AD CLSD DUE TO VOLCANIC ASH",
          selectionCode: "QFALC",
          ...overrides,
        },
      },
    },
  };
}

describe("summarizeNotams", () => {
  it("reports an aerodrome closure that is in force now, with its end time", () => {
    const s = summarizeNotams([item({})], now);
    expect(s).toEqual({
      closed: true,
      closedUntil: "2026-09-06T16:00:00Z",
      ashNotam: true,
      notams: [
        {
          number: "A1234/26",
          start: "2026-09-06T02:00:00Z",
          end: "2026-09-06T16:00:00Z",
          closure: true,
          ash: true,
          text: "AD CLSD DUE TO VOLCANIC ASH",
        },
      ],
    });
  });

  it("ignores closures that have ended or not yet started, and runway closures", () => {
    const past = item({ effectiveEnd: "2026-09-06T10:00:00.000Z" });
    const future = item({ number: "A1235/26", effectiveStart: "2026-09-07T00:00:00.000Z", effectiveEnd: "2026-09-07T04:00:00.000Z" });
    const runway = item({ number: "A1236/26", text: "RWY 07L/25R CLSD DUE TO WIP", selectionCode: "QMRLC" });
    const s = summarizeNotams([past, future, runway], now);
    expect(s.closed).toBe(false);
    expect(s.closedUntil).toBeNull();
    expect(s.notams.map((n) => n.number)).toEqual(["A1235/26", "A1236/26"]);
    expect(s.notams[0]?.closure).toBe(true);
    expect(s.notams[1]?.closure).toBe(false);
  });

  it("recognises closures from the text alone and PERM end times", () => {
    const s = summarizeNotams([item({ selectionCode: undefined, text: "AERODROME CLOSED TO ALL TRAFFIC", effectiveEnd: "PERM" })], now);
    expect(s.closed).toBe(true);
    expect(s.closedUntil).toBeNull();
    expect(s.notams[0]?.end).toBeNull();
  });

  it("skips items it cannot read and keeps going", () => {
    const s = summarizeNotams([{ properties: {} }, "nonsense", item({ number: "B0001/26" })], now);
    expect(s.notams.map((n) => n.number)).toEqual(["B0001/26"]);
  });
});
