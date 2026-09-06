import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeEntities, latestVonaFor, parseActivityLevel, parseActivityLevels, parseLatestVona, parseVonas } from "../src/lib/magma-parser";

const levelHtml = readFileSync(new URL("./fixtures/magma-level.html", import.meta.url), "utf8");
const vonaHtml = readFileSync(new URL("./fixtures/magma-vona.html", import.meta.url), "utf8");

describe("parseActivityLevel", () => {
  it("finds Level III (Siaga) for Anak Krakatau", () => {
    expect(parseActivityLevel(levelHtml)).toEqual({ level: 3, name: "Siaga" });
  });

  it("returns null when the volcano is absent", () => {
    expect(parseActivityLevel(levelHtml, "Gunung Tidak Ada")).toBeNull();
  });

  it("ignores the legend that lists all levels before the table", () => {
    const html =
      "Level IV (Awas) Level III (Siaga) Level II (Waspada) Level I (Normal) <td>Level II (Waspada)</td><td>Anak Krakatau - Lampung</td>";
    expect(parseActivityLevel(html)).toEqual({ level: 2, name: "Waspada" });
  });

  it("returns null when no level precedes the volcano", () => {
    expect(parseActivityLevel("<td>Anak Krakatau - Lampung</td> Level IV (Awas)")).toBeNull();
  });
});

describe("parseLatestVona", () => {
  it("parses the first timeline entry", () => {
    const v = parseLatestVona(vonaHtml);
    expect(v).toMatchObject({
      time: "2026-09-05T02:00:00Z",
      colorCode: "Red",
      title: "Anak Krakatau - 20260905/0200Z",
    });
    expect(v?.text).toContain("Eruption at 0200 UTC");
    expect(v?.url).toMatch(/^https:\/\/magma\.esdm\.go\.id\/v1\/vona\/22575\?signature=/);
  });

  it("returns null when there are no entries", () => {
    expect(parseLatestVona("<html></html>")).toBeNull();
  });

  it("skips day separators without a timestamp", () => {
    const html =
      '<div class="timeline-item timeline-day"><p class="timeline-date">x</p></div>' +
      '<div class="timeline-item"><small>2026-08-24 08:24:00 UTC</small><a href="#" class="btn btn-sm btn-warning">Orange</a>' +
      '<p class="timeline-title"><a href="#">Anak Krakatau - 20260824/0824Z</a></p><p class="timeline-text">Ash &amp; gas.</p></div>';
    expect(parseLatestVona(html)).toEqual({
      time: "2026-08-24T08:24:00Z",
      colorCode: "Orange",
      title: "Anak Krakatau - 20260824/0824Z",
      text: "Ash & gas.",
      url: null,
    });
  });
});

describe("decodeEntities", () => {
  it("decodes the common entities", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;&nbsp;f")).toBe("a & b <c> \"d\" 'e' f");
  });
});

describe("parseActivityLevels", () => {
  it("lists every volcano with its level from the table", () => {
    const levels = parseActivityLevels(levelHtml);
    expect(levels.get("Anak Krakatau")).toEqual({ level: 3, name: "Siaga" });
    expect(levels.get("Lewotobi Laki-laki")).toEqual({ level: 3, name: "Siaga" });
    expect(levels.get("Merapi")).toEqual({ level: 3, name: "Siaga" });
    expect(levels.has("Level IV (Awas)")).toBe(false);
  });
});

describe("parseVonas", () => {
  it("returns every entry with its volcano name, newest first", () => {
    const entries = parseVonas(vonaHtml);
    expect(entries.length).toBeGreaterThan(1);
    expect(entries[0]?.volcano).toBe("Anak Krakatau");
    expect(entries[0]?.time).toBe("2026-09-05T02:00:00Z");
    expect(entries.every((e) => e.volcano === "Anak Krakatau")).toBe(true);
  });

  it("picks the newest entry for one volcano and null for others", () => {
    const entries = parseVonas(vonaHtml);
    expect(latestVonaFor(entries, "Anak Krakatau")?.time).toBe("2026-09-05T02:00:00Z");
    expect(latestVonaFor(entries, "Semeru")).toBeNull();
  });
});
