# Krakatau Ash Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, mobile-first web page that shows the current and forecast (+6/+12/+18 h) volcanic ash cloud from Anak Krakatau, refreshed by a scheduled fetch script.

**Architecture:** A `scripts/fetch-data.ts` job pulls Darwin VAAC advisories (NOAA mirror) and MAGMA Indonesia status, parses them with pure modules in `src/lib/`, validates with a shared Zod schema, and writes `public/data/latest.json`. The Vite/TypeScript/Leaflet front end reads that JSON, draws ash polygons per time step, and overlays live Himawari infrared tiles and Open-Meteo winds fetched directly in the browser.

**Tech Stack:** Vite 5, TypeScript 5 (strict), Leaflet 1.9, Zod, @turf/boolean-point-in-polygon, @turf/distance, Vitest, tsx, GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-09-06-krakatau-ash-map-design.md`

## Global Constraints

- TypeScript strict mode; no `any` (use `unknown` and narrow).
- Validate all external input (fetched text, HTML, JSON, API responses) with Zod or explicit parsing before use.
- Handle errors explicitly; record source failures in `sourceErrors`, never swallow.
- No `console.log` left in committed code (the fetch script may use `console.error` for failures and `console.info` for a one-line summary).
- Commit format: `<type>: <description>`; end commit messages with the `Claude-Session:` trailer given in the session; no Co-Authored-By lines.
- Default UI language Indonesian (`id`), English toggle. Times shown in WIB (Asia/Jakarta).
- Vite `base: './'` so the build works on any static host.
- Brand navy `#00253f`; ash amber `#e08a1e`; plume purple `#6d28d9`.
- Volcano: Anak Krakatau, lat -6.102, lon 105.423, elevation 155 m, GVP 262000.
- Satellite tiles use time `default`; the script stores the latest frame time in `satellite.latestFrameTime` for display only.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` | tooling |
| `index.html` | page shell, meta/OG tags, static DOM skeleton |
| `src/lib/schema.ts` | Zod schemas and inferred types for `latest.json` |
| `src/lib/time.ts` | `DD/HHMMZ` resolution, WIB formatting, relative time |
| `src/lib/flight-level.ts` | FL to feet/metres, altitude formatting |
| `src/lib/vaa-parser.ts` | VAA bulletin text to `Advisory` |
| `src/lib/magma-parser.ts` | MAGMA HTML to alert level and latest VONA |
| `src/lib/build-latest.ts` | pure assembly of `LatestData` incl. keep-previous rule |
| `src/lib/geo.ts` | point-in-polygon and distance |
| `scripts/fetch-data.ts` | network I/O and file write for the scheduled job |
| `src/config.ts` | constants: URLs, volcano, colours |
| `src/i18n.ts` | `id`/`en` strings and `t()` |
| `src/map/map.ts` | Leaflet map creation, basemap, volcano marker |
| `src/map/ash-layer.ts` | ash polygons for a time step |
| `src/map/satellite-layer.ts` | Himawari IR overlay |
| `src/map/wind.ts` | Open-Meteo fetch + wind card render |
| `src/ui/*.ts` | status card, time chips, layer toggles, location check, share, sheet |
| `src/main.ts` | boot, polling, wiring |
| `src/style.css` | all styles |
| `public/data/latest.json` | generated data, committed |
| `public/brand/niriksagara.png`, `public/favicon.svg`, `public/manifest.webmanifest`, `public/og.png` | assets |
| `tests/**` | Vitest tests and fixtures |
| `.github/workflows/update-and-deploy.yml` | cron fetch, build, deploy |
| `README.md` | run, deploy, data sources |

---
### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`, `src/vite-env.d.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `preview`, `test`, `fetch`, `typecheck`.

- [ ] **Step 1: Init and install**

```bash
cd /home/rkhaq/Repos/Projects/krakatau-map
npm init -y
npm pkg set type=module private=true name=krakatau-ash-map version=0.1.0
npm pkg set scripts.dev=vite scripts.build="tsc --noEmit -p tsconfig.json && vite build" scripts.preview="vite preview" scripts.test="vitest run" scripts.fetch="tsx scripts/fetch-data.ts" scripts.typecheck="tsc --noEmit -p tsconfig.json"
npm install leaflet zod @turf/boolean-point-in-polygon @turf/distance @turf/helpers
npm install -D typescript vite vitest tsx @types/leaflet @types/node
```

- [ ] **Step 2: Config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noUncheckedIndexedAccess": true, "noImplicitOverride": true,
    "skipLibCheck": true, "esModuleInterop": true, "resolveJsonModule": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["node", "vite/client"],
    "noEmit": true
  },
  "include": ["src", "scripts", "tests", "vite.config.ts", "vitest.config.ts"]
}
```
`vite.config.ts`:
```ts
import { defineConfig } from "vite";
export default defineConfig({ base: "./", build: { target: "es2020", sourcemap: false } });
```
`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], environment: "node" } });
```
`.gitignore`: `node_modules`, `dist`, `.DS_Store`, `*.local`.

- [ ] **Step 3: Verify** `npx tsc --noEmit -p tsconfig.json` passes (no sources yet) and `npx vitest run` reports no test files without error (exit code 1 for "no tests" is acceptable at this point).

- [ ] **Step 4: Commit** `chore: scaffold vite typescript project`

---

### Task 2: Data schema

**Files:**
- Create: `src/lib/schema.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: `latestDataSchema`, `advisorySchema`, `layerSchema`, types `LatestData`, `Advisory`, `AshLayer`, `Observation`, `Forecast`, `MagmaStatus`, `SatelliteInfo`, `LonLat`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { latestDataSchema, layerSchema } from "../src/lib/schema";

const validLayer = { baseFl: 0, topFl: 500, polygon: [[105, -6], [106, -6], [106, -7]], movement: { direction: "W", speedKt: 30 } };

describe("schema", () => {
  it("accepts a valid layer", () => {
    expect(layerSchema.safeParse(validLayer).success).toBe(true);
  });
  it("rejects a polygon with fewer than 3 points", () => {
    expect(layerSchema.safeParse({ ...validLayer, polygon: [[105, -6], [106, -6]] }).success).toBe(false);
  });
  it("rejects a non-ISO timestamp at top level", () => {
    const r = latestDataSchema.safeParse({ generatedAt: "yesterday", volcano: { name: "x", lat: 0, lon: 0, elevationM: 0 }, vaac: null, magma: null, satellite: null, sourceErrors: [] });
    expect(r.success).toBe(false);
  });
  it("accepts a minimal valid document", () => {
    const r = latestDataSchema.safeParse({ generatedAt: "2026-09-06T02:00:00Z", volcano: { name: "x", lat: -6.1, lon: 105.4, elevationM: 155 }, vaac: null, magma: null, satellite: null, sourceErrors: [] });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/schema.test.ts` → fails (module not found).

- [ ] **Step 3: Implement**

```ts
import { z } from "zod";

export const isoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, "ISO 8601 UTC timestamp expected");
export const lonLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export const movementSchema = z.object({ direction: z.string().min(1), speedKt: z.number().min(0) });
export const layerSchema = z.object({ baseFl: z.number().int().min(0), topFl: z.number().int().min(0), polygon: z.array(lonLatSchema).min(3), movement: movementSchema.nullable() });
export const observationSchema = z.object({ kind: z.enum(["OBS", "EST"]), time: isoDateTime, layers: z.array(layerSchema) });
export const forecastSchema = z.object({ hoursAhead: z.number().int().positive(), time: isoDateTime, layers: z.array(layerSchema) });
export const advisorySchema = z.object({
  header: z.string().min(1), issuedAt: isoDateTime, volcano: z.string().min(1),
  advisoryNumber: z.string().nullable(), infoSource: z.string().nullable(), eruptionDetails: z.string().nullable(),
  remarks: z.string().nullable(), nextAdvisoryBy: isoDateTime.nullable(),
  observation: observationSchema.nullable(), forecasts: z.array(forecastSchema), raw: z.string(),
});
export const activityLevelSchema = z.object({ level: z.number().int().min(1).max(4), name: z.string().min(1) });
export const vonaSchema = z.object({ time: isoDateTime, colorCode: z.string(), title: z.string(), text: z.string(), url: z.string().url().nullable() });
export const magmaSchema = z.object({ fetchedAt: isoDateTime, activityLevel: activityLevelSchema.nullable(), latestVona: vonaSchema.nullable() });
export const satelliteSchema = z.object({ layer: z.string(), latestFrameTime: isoDateTime.nullable() });
export const latestDataSchema = z.object({
  generatedAt: isoDateTime,
  volcano: z.object({ name: z.string(), lat: z.number(), lon: z.number(), elevationM: z.number() }),
  vaac: advisorySchema.nullable(), magma: magmaSchema.nullable(), satellite: satelliteSchema.nullable(),
  sourceErrors: z.array(z.string()),
});
export type LonLat = z.infer<typeof lonLatSchema>;
export type AshLayer = z.infer<typeof layerSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Forecast = z.infer<typeof forecastSchema>;
export type Advisory = z.infer<typeof advisorySchema>;
export type ActivityLevel = z.infer<typeof activityLevelSchema>;
export type VonaEntry = z.infer<typeof vonaSchema>;
export type MagmaStatus = z.infer<typeof magmaSchema>;
export type SatelliteInfo = z.infer<typeof satelliteSchema>;
export type LatestData = z.infer<typeof latestDataSchema>;
```

- [ ] **Step 4: Run** → pass. **Step 5: Commit** `feat: add latest.json zod schema`

---
### Task 3: Time and flight-level helpers

**Files:**
- Create: `src/lib/time.ts`, `src/lib/flight-level.ts`
- Test: `tests/time.test.ts`, `tests/flight-level.test.ts`

**Interfaces:**
- Produces:
  - `resolveDayTime(token: string, reference: Date): Date | null` — `"06/0010Z"` plus a reference instant → the UTC instant in the month (previous, same, or next) closest to the reference.
  - `parseDtg(value: string): Date | null` — `"20260906/0030Z"` → Date.
  - `toIso(d: Date): string` — seconds precision, `Z` suffix.
  - `formatWib(iso: string, locale: "id" | "en"): string` — e.g. `"6 Sep 2026, 07.10 WIB"`.
  - `formatWibClock(iso: string): string` — `"07.10"`.
  - `minutesBetween(fromIso: string, now: Date): number`.
  - `formatRelative(iso: string, now: Date, locale: "id" | "en"): string` — `"12 mnt lalu"`, `"3 j lalu"`, `"2 hr lalu"` / `"12 min ago"`, `"3 h ago"`, `"2 d ago"`.
  - `flightLevelToFeet(fl: number): number`, `flightLevelToMetres(fl: number): number`, `formatAltitude(fl: number, locale): string` — `"15,2 km (50.000 kaki)"` / `"15.2 km (50,000 ft)"`.

- [ ] **Step 1: Failing tests**

```ts
// tests/time.test.ts
import { describe, expect, it } from "vitest";
import { formatRelative, formatWib, parseDtg, resolveDayTime, toIso } from "../src/lib/time";

describe("parseDtg", () => {
  it("parses YYYYMMDD/HHMMZ", () => {
    expect(toIso(parseDtg("20260906/0030Z")!)).toBe("2026-09-06T00:30:00Z");
  });
  it("returns null on garbage", () => { expect(parseDtg("soon")).toBeNull(); });
});
describe("resolveDayTime", () => {
  const ref = new Date("2026-09-06T00:30:00Z");
  it("same month", () => { expect(toIso(resolveDayTime("06/0010Z", ref)!)).toBe("2026-09-06T00:10:00Z"); });
  it("forecast into next month picks the closest instant", () => {
    const eom = new Date("2026-09-30T23:30:00Z");
    expect(toIso(resolveDayTime("01/1730Z", eom)!)).toBe("2026-10-01T17:30:00Z");
  });
  it("observation from previous month at start of month", () => {
    const som = new Date("2026-10-01T00:20:00Z");
    expect(toIso(resolveDayTime("30/2350Z", som)!)).toBe("2026-09-30T23:50:00Z");
  });
  it("returns null for bad token", () => { expect(resolveDayTime("late", ref)).toBeNull(); });
});
describe("formatting", () => {
  it("formats WIB in Indonesian", () => { expect(formatWib("2026-09-06T00:10:00Z", "id")).toMatch(/6 Sep 2026.*07[.:]10/); });
  it("relative minutes and hours", () => {
    const now = new Date("2026-09-06T03:00:00Z");
    expect(formatRelative("2026-09-06T02:48:00Z", now, "id")).toBe("12 mnt lalu");
    expect(formatRelative("2026-09-06T00:00:00Z", now, "en")).toBe("3 h ago");
    expect(formatRelative("2026-09-04T00:00:00Z", now, "id")).toBe("2 hr lalu");
  });
});
```
```ts
// tests/flight-level.test.ts
import { describe, expect, it } from "vitest";
import { flightLevelToFeet, flightLevelToMetres, formatAltitude } from "../src/lib/flight-level";
describe("flight level", () => {
  it("FL500 is 50000 ft and 15240 m", () => {
    expect(flightLevelToFeet(500)).toBe(50000);
    expect(flightLevelToMetres(500)).toBe(15240);
  });
  it("formats id and en", () => {
    expect(formatAltitude(500, "id")).toBe("15,2 km (50.000 kaki)");
    expect(formatAltitude(200, "en")).toBe("6.1 km (20,000 ft)");
  });
});
```

- [ ] **Step 2: Run** → fail. **Step 3: Implement**

```ts
// src/lib/time.ts
export type Locale = "id" | "en";
const DTG_RE = /^(\d{4})(\d{2})(\d{2})\/(\d{2})(\d{2})Z?$/;
const DAYTIME_RE = /^(\d{2})\/(\d{2})(\d{2})Z?$/;
export function parseDtg(value: string): Date | null {
  const m = DTG_RE.exec(value.trim()); if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as number[];
  const t = Date.UTC(y!, mo! - 1, d!, h!, mi!); return Number.isNaN(t) ? null : new Date(t);
}
export function resolveDayTime(token: string, reference: Date): Date | null {
  const m = DAYTIME_RE.exec(token.trim()); if (!m) return null;
  const day = Number(m[1]), hour = Number(m[2]), minute = Number(m[3]);
  if (day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const y = reference.getUTCFullYear(), mo = reference.getUTCMonth();
  let best: Date | null = null;
  for (const delta of [-1, 0, 1]) {
    const cand = new Date(Date.UTC(y, mo + delta, day, hour, minute));
    if (cand.getUTCDate() !== day) continue; // day overflowed (e.g. 31 in a 30-day month)
    if (!best || Math.abs(cand.getTime() - reference.getTime()) < Math.abs(best.getTime() - reference.getTime())) best = cand;
  }
  return best;
}
export function toIso(d: Date): string { return d.toISOString().replace(/\.\d{3}Z$/, "Z"); }
const WIB = "Asia/Jakarta";
export function formatWib(iso: string, locale: Locale): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { timeZone: WIB, day: "numeric", month: "short", year: "numeric" }).format(d);
  return `${date}, ${formatWibClock(iso)} WIB`;
}
export function formatWibClock(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: WIB, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
export function minutesBetween(fromIso: string, now: Date): number { return Math.round((now.getTime() - new Date(fromIso).getTime()) / 60000); }
export function formatRelative(iso: string, now: Date, locale: Locale): string {
  const mins = Math.max(0, minutesBetween(iso, now));
  const id = locale === "id";
  if (mins < 60) return id ? `${mins} mnt lalu` : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return id ? `${hours} j lalu` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return id ? `${days} hr lalu` : `${days} d ago`;
}
```
```ts
// src/lib/flight-level.ts
import type { Locale } from "./time";
export function flightLevelToFeet(fl: number): number { return fl * 100; }
export function flightLevelToMetres(fl: number): number { return Math.round(fl * 100 * 0.3048); }
export function formatAltitude(fl: number, locale: Locale): string {
  const km = (flightLevelToMetres(fl) / 1000).toFixed(1);
  const feet = flightLevelToFeet(fl);
  if (locale === "id") return `${km.replace(".", ",")} km (${feet.toLocaleString("id-ID")} kaki)`;
  return `${km} km (${feet.toLocaleString("en-US")} ft)`;
}
```

- [ ] **Step 4: Run** → pass. **Step 5: Commit** `feat: add time and flight level helpers`

---
### Task 4: VAA parser

**Files:**
- Create: `src/lib/vaa-parser.ts`, `tests/fixtures/fvau04-krakatau.txt` (copy of the real 2026/183 bulletin), `tests/fixtures/fvau02-semeru.txt`
- Test: `tests/vaa-parser.test.ts`

**Interfaces:**
- Consumes: `parseDtg`, `resolveDayTime`, `toIso` from `time.ts`; `Advisory`, `AshLayer`, `advisorySchema` from `schema.ts`.
- Produces:
  - `splitBulletins(text: string): string[]`
  - `parseFields(bulletin: string): Map<string, string>`
  - `parseCoordinate(token: string): number | null`
  - `parseLayers(text: string): AshLayer[]`
  - `parseAdvisory(bulletin: string): ParseResult` where `ParseResult = { ok: true; advisory: Advisory } | { ok: false; header: string; reason: string }`
  - `parseAllAdvisories(text: string): { advisories: Advisory[]; failures: { header: string; reason: string }[] }`
  - `latestAdvisoryFor(advisories: Advisory[], volcano: RegExp): Advisory | null`

- [ ] **Step 1: Failing tests**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestAdvisoryFor, parseAdvisory, parseAllAdvisories, parseCoordinate, parseFields, parseLayers, splitBulletins } from "../src/lib/vaa-parser";

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
  it("rejects nonsense", () => { expect(parseCoordinate("X12")).toBeNull(); });
});

describe("parseFields", () => {
  it("joins continuation lines and strips trailing =", () => {
    const f = parseFields(krakatau);
    expect(f.get("VOLCANO")).toBe("KRAKATAU 262000");
    expect(f.get("OBS VA CLD")).toContain("MOV W 30KT");
    expect(f.get("NXT ADVISORY")).toBe("NO LATER THAN 20260906/0330Z");
  });
});

describe("parseLayers", () => {
  it("parses two layers with movement", () => {
    const layers = parseLayers("SFC/FL200 S0504 E10700 - S0641 E11007 - S0901 E10914 MOV E 10KT SFC/FL500 S0714 E10617 - S1031 E10025 - S1731 E09640 - S1203 E07906 MOV W 30KT");
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
    expect(a.advisoryNumber).toBe("2026/183");
    expect(a.observation?.kind).toBe("OBS");
    expect(a.observation?.time).toBe("2026-09-06T00:10:00Z");
    expect(a.observation?.layers).toHaveLength(2);
    expect(a.forecasts.map((f) => f.hoursAhead)).toEqual([6, 12, 18]);
    expect(a.forecasts[0]?.time).toBe("2026-09-06T06:10:00Z");
    expect(a.forecasts[2]?.layers[1]?.topFl).toBe(500);
    expect(a.nextAdvisoryBy).toBe("2026-09-06T03:30:00Z");
    expect(a.remarks).toContain("DISPERSION MODELS");
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
  });
  it("fails without volcano", () => {
    const r = parseAdvisory("FVAU09 ADRM 060000\nVA ADVISORY\nDTG: 20260906/0000Z\n");
    expect(r.ok).toBe(false);
  });
  it("uses issue time plus hours when a forecast has no time token", () => {
    const r = parseAdvisory("FVAU09 ADRM 060000\nVA ADVISORY\nDTG: 20260906/0000Z\nVOLCANO: TEST 1\nFCST VA CLD +6 HR: NO VA EXP\n");
    if (!r.ok) throw new Error(r.reason);
    expect(r.advisory.forecasts[0]).toMatchObject({ hoursAhead: 6, time: "2026-09-06T06:00:00Z", layers: [] });
  });
});

describe("parseAllAdvisories and latestAdvisoryFor", () => {
  it("splits concatenated bulletins and picks the newest Krakatau one", () => {
    const older = krakatau.replace("DTG: 20260906/0030Z", "DTG: 20260905/1830Z").replace("FVAU04 ADRM 060030", "FVAU04 ADRM 051830");
    const { advisories, failures } = parseAllAdvisories(`${older}\n\n${semeru}\n\n${krakatau}\n\nFVAU07 ADRM 060000\nVA ADVISORY\nVOLCANO: BROKEN\n`);
    expect(failures).toHaveLength(1);
    expect(advisories).toHaveLength(3);
    expect(latestAdvisoryFor(advisories, /KRAKATAU/i)?.issuedAt).toBe("2026-09-06T00:30:00Z");
    expect(latestAdvisoryFor(advisories, /MERAPI/i)).toBeNull();
  });
  it("splitBulletins ignores blank leading text", () => {
    expect(splitBulletins(`\n\n${semeru}`)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run** → fail. **Step 3: Implement**

```ts
import { advisorySchema, type Advisory, type AshLayer, type Forecast, type LonLat, type Observation } from "./schema";
import { parseDtg, resolveDayTime, toIso } from "./time";

export type ParseFailure = { header: string; reason: string };
export type ParseResult = { ok: true; advisory: Advisory } | ({ ok: false } & ParseFailure);

const HEADER_RE = /^FV[A-Z]{2}\d{2} [A-Z]{4} \d{6}/;
const FIELD_RE = /^([A-Z][A-Z0-9 +/]*?):\s?(.*)$/;
const LAYER_START_RE = /(SFC|FL(\d{3}))\/FL(\d{3})/g;
const COORD_PAIR_RE = /([NS]\d{4}(?:\.\d+)?)\s+([EW]\d{5}(?:\.\d+)?)/g;
const MOVEMENT_RE = /MOV\s+([NSEW]{1,3})\s+(\d{1,3})\s*KT/;
const DAYTIME_TOKEN_RE = /^\s*(\d{2}\/\d{4}Z)\s*/;
const FCST_KEY_RE = /^FCST VA CLD \+(\d+)\s?HR$/;

export function splitBulletins(text: string): string[] {
  const out: string[] = []; let current: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (HEADER_RE.test(line)) { if (current.length) out.push(current.join("\n")); current = [line]; }
    else if (current.length) current.push(line);
  }
  if (current.length) out.push(current.join("\n"));
  return out.map((b) => b.trim()).filter((b) => b.length > 0);
}

export function parseFields(bulletin: string): Map<string, string> {
  const fields = new Map<string, string>(); let key: string | null = null;
  for (const raw of bulletin.split(/\r?\n/).slice(1)) {
    const m = FIELD_RE.exec(raw);
    if (m && !/^\s/.test(raw)) { key = m[1]!.trim(); fields.set(key, m[2]!.trim()); }
    else if (key && /^\s/.test(raw)) fields.set(key, `${fields.get(key) ?? ""} ${raw.trim()}`.trim());
  }
  for (const [k, v] of fields) fields.set(k, v.replace(/=\s*$/, "").trim());
  return fields;
}

export function parseCoordinate(token: string): number | null {
  const m = /^([NSEW])(\d{4,5})(?:\.(\d+))?$/.exec(token.trim()); if (!m) return null;
  const hemi = m[1]!, digits = m[2]!, frac = m[3];
  if ((hemi === "N" || hemi === "S") && digits.length !== 4) return null;
  if ((hemi === "E" || hemi === "W") && digits.length !== 5) return null;
  const deg = Number(digits.slice(0, -2)); const min = Number(`${digits.slice(-2)}${frac ? `.${frac}` : ""}`);
  if (min >= 60) return null;
  const value = deg + min / 60; const signed = hemi === "S" || hemi === "W" ? -value : value;
  return Math.round(signed * 10000) / 10000;
}

export function parseLayers(text: string): AshLayer[] {
  const starts = [...text.matchAll(LAYER_START_RE)]; const layers: AshLayer[] = [];
  starts.forEach((m, i) => {
    const segEnd = i + 1 < starts.length ? starts[i + 1]!.index! : text.length;
    const segment = text.slice(m.index! + m[0].length, segEnd);
    const polygon: LonLat[] = [];
    for (const c of segment.matchAll(COORD_PAIR_RE)) {
      const lat = parseCoordinate(c[1]!), lon = parseCoordinate(c[2]!);
      if (lat !== null && lon !== null) polygon.push([lon, lat]);
    }
    if (polygon.length < 3) return;
    const mv = MOVEMENT_RE.exec(segment);
    layers.push({ baseFl: m[1] === "SFC" ? 0 : Number(m[2]), topFl: Number(m[3]), polygon, movement: mv ? { direction: mv[1]!, speedKt: Number(mv[2]) } : null });
  });
  return layers;
}

function splitTimeToken(value: string, reference: Date): { time: Date | null; rest: string } {
  const m = DAYTIME_TOKEN_RE.exec(value);
  if (!m) return { time: null, rest: value };
  return { time: resolveDayTime(m[1]!, reference), rest: value.slice(m[0].length) };
}

export function parseAdvisory(bulletin: string): ParseResult {
  const header = (bulletin.split(/\r?\n/)[0] ?? "").trim();
  const fields = parseFields(bulletin);
  const issued = parseDtg(fields.get("DTG") ?? "");
  if (!issued) return { ok: false, header, reason: "missing or invalid DTG" };
  const volcano = fields.get("VOLCANO");
  if (!volcano) return { ok: false, header, reason: "missing VOLCANO" };
  let observation: Observation | null = null;
  for (const kind of ["OBS", "EST"] as const) {
    const cloud = fields.get(`${kind} VA CLD`); if (cloud === undefined) continue;
    const dtgToken = fields.get(`${kind} VA DTG`);
    const time = dtgToken ? resolveDayTime(dtgToken, issued) : null;
    observation = { kind, time: toIso(time ?? issued), layers: parseLayers(cloud) }; break;
  }
  const forecasts: Forecast[] = [];
  for (const [key, value] of fields) {
    const fm = FCST_KEY_RE.exec(key); if (!fm) continue;
    const hoursAhead = Number(fm[1]); const { time, rest } = splitTimeToken(value, issued);
    forecasts.push({ hoursAhead, time: toIso(time ?? new Date(issued.getTime() + hoursAhead * 3600_000)), layers: parseLayers(rest) });
  }
  forecasts.sort((a, b) => a.hoursAhead - b.hoursAhead);
  const nxt = /(\d{8}\/\d{4}Z)/.exec(fields.get("NXT ADVISORY") ?? ""); const nextDate = nxt ? parseDtg(nxt[1]!) : null;
  const candidate: Advisory = {
    header, issuedAt: toIso(issued), volcano,
    advisoryNumber: fields.get("ADVISORY NR") ?? null, infoSource: fields.get("INFO SOURCE") ?? null,
    eruptionDetails: fields.get("ERUPTION DETAILS") ?? null, remarks: fields.get("RMK") ?? null,
    nextAdvisoryBy: nextDate ? toIso(nextDate) : null, observation, forecasts, raw: bulletin,
  };
  const checked = advisorySchema.safeParse(candidate);
  return checked.success ? { ok: true, advisory: checked.data } : { ok: false, header, reason: checked.error.message };
}

export function parseAllAdvisories(text: string): { advisories: Advisory[]; failures: ParseFailure[] } {
  const advisories: Advisory[] = []; const failures: ParseFailure[] = [];
  for (const b of splitBulletins(text)) { const r = parseAdvisory(b); if (r.ok) advisories.push(r.advisory); else failures.push({ header: r.header, reason: r.reason }); }
  return { advisories, failures };
}

export function latestAdvisoryFor(advisories: Advisory[], volcano: RegExp): Advisory | null {
  return advisories.filter((a) => volcano.test(a.volcano)).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0] ?? null;
}
```

- [ ] **Step 4: Run** → pass. **Step 5: Commit** `feat: parse VAAC volcanic ash advisories`

---
### Task 5: MAGMA parser

**Files:**
- Create: `src/lib/magma-parser.ts`, `tests/fixtures/magma-level.html` (trimmed real table), `tests/fixtures/magma-vona.html` (trimmed real timeline)
- Test: `tests/magma-parser.test.ts`

**Interfaces:**
- Consumes: `ActivityLevel`, `VonaEntry` from `schema.ts`.
- Produces: `parseActivityLevel(html: string, volcanoName?: string): ActivityLevel | null`; `parseLatestVona(html: string): VonaEntry | null`; `decodeEntities(s: string): string`.

- [ ] **Step 1: Failing tests**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseActivityLevel, parseLatestVona } from "../src/lib/magma-parser";
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
    const html = `Level IV (Awas) Level III (Siaga) Level II (Waspada) Level I (Normal) <td>Level II (Waspada)</td><td>Anak Krakatau - Lampung</td>`;
    expect(parseActivityLevel(html)).toEqual({ level: 2, name: "Waspada" });
  });
});
describe("parseLatestVona", () => {
  it("parses the first timeline entry", () => {
    const v = parseLatestVona(vonaHtml);
    expect(v).toMatchObject({ time: "2026-09-05T02:00:00Z", colorCode: "Red", title: "Anak Krakatau - 20260905/0200Z" });
    expect(v?.text).toContain("Eruption at 0200 UTC");
    expect(v?.url).toMatch(/^https:\/\/magma\.esdm\.go\.id\/v1\/vona\/22575\?signature=/);
  });
  it("returns null when there are no entries", () => { expect(parseLatestVona("<html></html>")).toBeNull(); });
});
```

- [ ] **Step 2: Run** → fail. **Step 3: Implement**

```ts
import { activityLevelSchema, vonaSchema, type ActivityLevel, type VonaEntry } from "./schema";
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };
const LEVEL_RE = /Level (I|II|III|IV)\s*\(([^)]+)\)/g;
export function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
export function parseActivityLevel(html: string, volcanoName = "Anak Krakatau"): ActivityLevel | null {
  const idx = html.indexOf(`${volcanoName} - `); if (idx < 0) return null;
  let found: ActivityLevel | null = null;
  for (const m of html.matchAll(LEVEL_RE)) {
    if (m.index === undefined || m.index > idx) break;
    const level = ROMAN[m[1]!]; if (!level) continue;
    const parsed = activityLevelSchema.safeParse({ level, name: m[2]!.trim() });
    if (parsed.success) found = parsed.data;
  }
  return found;
}
export function parseLatestVona(html: string): VonaEntry | null {
  const blocks = html.split(/class="timeline-item"/).slice(1);
  for (const block of blocks) {
    const time = /<small>(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC<\/small>/.exec(block); if (!time) continue;
    const color = /btn-(?:danger|warning|success|secondary|info|light|dark)">([A-Za-z]+)<\/a>/.exec(block);
    const title = /timeline-title"><a[^>]*>([^<]+)<\/a>/.exec(block);
    const text = /timeline-text">([\s\S]*?)<\/p>/.exec(block);
    const url = /card-link[^"]*"\s+href="([^"]+)"/.exec(block);
    const candidate = { time: `${time[1]}T${time[2]}Z`, colorCode: color?.[1] ?? "Unknown", title: decodeEntities(title?.[1]?.trim() ?? ""), text: decodeEntities(text?.[1]?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() ?? ""), url: url ? decodeEntities(url[1]!) : null };
    const parsed = vonaSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}
```

- [ ] **Step 4: Run** → pass. **Step 5: Commit** `feat: parse MAGMA alert level and VONA`

---

### Task 6: Assemble latest.json and the fetch script

**Files:**
- Create: `src/lib/build-latest.ts`, `scripts/fetch-data.ts`, `public/data/latest.json` (generated by running the script)
- Test: `tests/build-latest.test.ts`

**Interfaces:**
- Consumes: parsers from Tasks 4-5, `latestDataSchema`, `toIso`.
- Produces:
  - `type SourceResult<T> = { status: "ok"; value: T } | { status: "failed"; error: string }`
  - `buildLatest(input: { now: Date; vaac: SourceResult<Advisory | null>; vaacPartialFailures: string[]; magma: SourceResult<MagmaStatus>; satellite: SourceResult<SatelliteInfo>; previous: LatestData | null }): LatestData`
  - `extractLatestFrameTime(capabilitiesXml: string, layer: string): string | null`

Keep-previous rule: if `vaac.status === "failed"`, or (`vaac.value === null` and `vaacPartialFailures.length > 0`), and `previous?.vaac` exists, reuse `previous.vaac` and push an error `"vaac: kept previous advisory <header> because ..."`. Otherwise use the fresh value.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildLatest, extractLatestFrameTime } from "../src/lib/build-latest";
import type { Advisory, LatestData } from "../src/lib/schema";
const adv: Advisory = { header: "FVAU04 ADRM 060030", issuedAt: "2026-09-06T00:30:00Z", volcano: "KRAKATAU 262000", advisoryNumber: "2026/183", infoSource: null, eruptionDetails: null, remarks: null, nextAdvisoryBy: null, observation: null, forecasts: [], raw: "" };
const now = new Date("2026-09-06T03:00:00Z");
const magmaOk = { status: "ok" as const, value: { fetchedAt: "2026-09-06T03:00:00Z", activityLevel: { level: 3, name: "Siaga" }, latestVona: null } };
const satOk = { status: "ok" as const, value: { layer: "L", latestFrameTime: null } };
const base = { now, vaacPartialFailures: [] as string[], magma: magmaOk, satellite: satOk, previous: null };
describe("buildLatest", () => {
  it("uses fresh advisory", () => {
    const d = buildLatest({ ...base, vaac: { status: "ok", value: adv } });
    expect(d.vaac?.header).toBe(adv.header); expect(d.sourceErrors).toEqual([]);
  });
  it("keeps previous advisory when vaac fetch failed", () => {
    const previous: LatestData = { generatedAt: "2026-09-06T02:00:00Z", volcano: { name: "x", lat: 0, lon: 0, elevationM: 0 }, vaac: adv, magma: null, satellite: null, sourceErrors: [] };
    const d = buildLatest({ ...base, previous, vaac: { status: "failed", error: "timeout" } });
    expect(d.vaac?.header).toBe(adv.header); expect(d.sourceErrors[0]).toMatch(/kept previous/);
  });
  it("keeps previous when no advisory found but some files failed", () => {
    const previous: LatestData = { generatedAt: "2026-09-06T02:00:00Z", volcano: { name: "x", lat: 0, lon: 0, elevationM: 0 }, vaac: adv, magma: null, satellite: null, sourceErrors: [] };
    const d = buildLatest({ ...base, previous, vaacPartialFailures: ["fvau04: 503"], vaac: { status: "ok", value: null } });
    expect(d.vaac?.header).toBe(adv.header);
  });
  it("clears advisory when all files fetched and none is Krakatau", () => {
    const previous: LatestData = { generatedAt: "2026-09-06T02:00:00Z", volcano: { name: "x", lat: 0, lon: 0, elevationM: 0 }, vaac: adv, magma: null, satellite: null, sourceErrors: [] };
    expect(buildLatest({ ...base, previous, vaac: { status: "ok", value: null } }).vaac).toBeNull();
  });
  it("records magma failure and still validates", () => {
    const d = buildLatest({ ...base, vaac: { status: "ok", value: adv }, magma: { status: "failed", error: "403" } });
    expect(d.magma).toBeNull(); expect(d.sourceErrors).toEqual(["magma: 403"]);
  });
});
describe("extractLatestFrameTime", () => {
  it("reads the Default value of the layer's time dimension", () => {
    const xml = `<Layer><ows:Identifier>Other</ows:Identifier><Dimension><Default>2026-01-01</Default></Dimension></Layer><Layer><ows:Identifier>L</ows:Identifier><Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-09-06T02:20:00Z</Default></Dimension></Layer>`;
    expect(extractLatestFrameTime(xml, "L")).toBe("2026-09-06T02:20:00Z");
    expect(extractLatestFrameTime(xml, "Missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run** → fail. **Step 3: Implement `build-latest.ts`**

```ts
import { latestDataSchema, type Advisory, type LatestData, type MagmaStatus, type SatelliteInfo } from "./schema";
import { toIso } from "./time";
export type SourceResult<T> = { status: "ok"; value: T } | { status: "failed"; error: string };
import { VOLCANO } from "./volcano"; // src/lib/volcano.ts: export const VOLCANO = { name: "Anak Krakatau", lat: -6.102, lon: 105.423, elevationM: 155 } as const;
export interface BuildInput { now: Date; vaac: SourceResult<Advisory | null>; vaacPartialFailures: string[]; magma: SourceResult<MagmaStatus>; satellite: SourceResult<SatelliteInfo>; previous: LatestData | null }
export function buildLatest(input: BuildInput): LatestData {
  const errors: string[] = [];
  let vaac: Advisory | null;
  if (input.vaac.status === "failed") {
    vaac = input.previous?.vaac ?? null;
    errors.push(vaac ? `vaac: kept previous advisory ${vaac.header} because fetch failed: ${input.vaac.error}` : `vaac: ${input.vaac.error}`);
  } else if (input.vaac.value === null && input.vaacPartialFailures.length > 0 && input.previous?.vaac) {
    vaac = input.previous.vaac;
    errors.push(`vaac: kept previous advisory ${vaac.header} because no Krakatau advisory was found and some files failed: ${input.vaacPartialFailures.join("; ")}`);
  } else {
    vaac = input.vaac.value;
    for (const f of input.vaacPartialFailures) errors.push(`vaac: ${f}`);
  }
  let magma: MagmaStatus | null = null;
  if (input.magma.status === "ok") magma = input.magma.value; else errors.push(`magma: ${input.magma.error}`);
  let satellite: SatelliteInfo | null = null;
  if (input.satellite.status === "ok") satellite = input.satellite.value; else errors.push(`satellite: ${input.satellite.error}`);
  return latestDataSchema.parse({ generatedAt: toIso(input.now), volcano: VOLCANO, vaac, magma, satellite, sourceErrors: errors });
}
export function extractLatestFrameTime(capabilitiesXml: string, layer: string): string | null {
  const layerRe = new RegExp(`<Layer>(?:(?!</Layer>)[\\s\\S])*?<ows:Identifier>${layer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</ows:Identifier>(?:(?!</Layer>)[\\s\\S])*?</Layer>`);
  const block = layerRe.exec(capabilitiesXml)?.[0]; if (!block) return null;
  const def = /<Dimension>[\s\S]*?<Default>([^<]+)<\/Default>/.exec(block)?.[1]?.trim(); if (!def) return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(def) ? def : null;
}
```

**Step 3b: `scripts/fetch-data.ts`** (network I/O only, thin):

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildLatest, extractLatestFrameTime, type SourceResult } from "../src/lib/build-latest";
import { parseActivityLevel, parseLatestVona } from "../src/lib/magma-parser";
import { latestDataSchema, type Advisory, type LatestData, type MagmaStatus, type SatelliteInfo } from "../src/lib/schema";
import { toIso } from "../src/lib/time";
import { latestAdvisoryFor, parseAllAdvisories } from "../src/lib/vaa-parser";

const OUT = resolve(process.cwd(), "public/data/latest.json");
const NOAA_FILES = Array.from({ length: 8 }, (_, i) => `fvau0${i + 1}.adrm..txt`);
const NOAA_BASE = "https://tgftp.nws.noaa.gov/data/raw/fv/";
const MAGMA_LEVEL_URL = "https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas";
const MAGMA_VONA_URL = "https://magma.esdm.go.id/v1/vona?code=KRA";
const GIBS_CAPS_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml";
const GIBS_LAYER = "Himawari_AHI_Band13_Clean_Infrared";
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 krakatau-ash-map/0.1 (+https://niriksagara.id)";

async function fetchText(url: string, timeoutMs = 20_000, headers: Record<string, string> = {}): Promise<string> {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": BROWSER_UA, ...headers } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}
function errorMessage(e: unknown): string { return e instanceof Error ? e.message : String(e); }

async function fetchVaac(): Promise<{ result: SourceResult<Advisory | null>; partialFailures: string[] }> {
  const settled = await Promise.allSettled(NOAA_FILES.map((f) => fetchText(NOAA_BASE + f)));
  const partialFailures: string[] = []; const advisories: Advisory[] = [];
  settled.forEach((s, i) => {
    const name = NOAA_FILES[i]!;
    if (s.status === "rejected") { partialFailures.push(`${name}: ${errorMessage(s.reason)}`); return; }
    const parsed = parseAllAdvisories(s.value);
    for (const f of parsed.failures) partialFailures.push(`${name}: ${f.header}: ${f.reason}`);
    advisories.push(...parsed.advisories);
  });
  if (partialFailures.length === NOAA_FILES.length && advisories.length === 0) return { result: { status: "failed", error: partialFailures.join("; ") }, partialFailures: [] };
  return { result: { status: "ok", value: latestAdvisoryFor(advisories, /KRAKATAU/i) }, partialFailures };
}
async function fetchMagma(now: Date): Promise<SourceResult<MagmaStatus>> {
  const [level, vona] = await Promise.allSettled([fetchText(MAGMA_LEVEL_URL), fetchText(MAGMA_VONA_URL)]);
  if (level.status === "rejected" && vona.status === "rejected") return { status: "failed", error: `${errorMessage(level.reason)}; ${errorMessage(vona.reason)}` };
  return { status: "ok", value: { fetchedAt: toIso(now), activityLevel: level.status === "fulfilled" ? parseActivityLevel(level.value) : null, latestVona: vona.status === "fulfilled" ? parseLatestVona(vona.value) : null } };
}
async function fetchSatellite(): Promise<SourceResult<SatelliteInfo>> {
  try { const xml = await fetchText(GIBS_CAPS_URL, 40_000); return { status: "ok", value: { layer: GIBS_LAYER, latestFrameTime: extractLatestFrameTime(xml, GIBS_LAYER) } }; }
  catch (e) { return { status: "failed", error: errorMessage(e) }; }
}
async function readPrevious(): Promise<LatestData | null> {
  try { const parsed = latestDataSchema.safeParse(JSON.parse(await readFile(OUT, "utf8"))); return parsed.success ? parsed.data : null; }
  catch { return null; }
}
async function main(): Promise<void> {
  const now = new Date();
  const [previous, vaac, magma, satellite] = await Promise.all([readPrevious(), fetchVaac(), fetchMagma(now), fetchSatellite()]);
  const data = buildLatest({ now, vaac: vaac.result, vaacPartialFailures: vaac.partialFailures, magma, satellite, previous });
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  for (const e of data.sourceErrors) console.error(`warning: ${e}`);
  console.info(`wrote ${OUT}: vaac=${data.vaac?.header ?? "none"} level=${data.magma?.activityLevel?.level ?? "?"} sat=${data.satellite?.latestFrameTime ?? "?"}`);
  if (data.vaac === null && data.magma === null && data.satellite === null) process.exitCode = 1;
}
main().catch((e: unknown) => { console.error(`fatal: ${errorMessage(e)}`); process.exitCode = 1; });
```
Note: `readPrevious` intentionally swallows a missing/invalid file because "no previous data" is a normal state on first run; the reason is documented in a comment.

- [ ] **Step 4: Run tests** → pass. **Step 5: Run `npm run fetch`** and confirm `public/data/latest.json` has the Krakatau advisory and Level III. **Step 6: Commit** `feat: add scheduled data fetch script and first snapshot`

---

### Task 7: Geo helpers

**Files:** Create `src/lib/geo.ts`; Test `tests/geo.test.ts`.

**Interfaces:** `layersContaining(lon: number, lat: number, layers: AshLayer[]): AshLayer[]`; `distanceKm(aLon, aLat, bLon, bLat): number`; `closeRing(polygon: LonLat[]): LonLat[]`.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from "vitest";
import { closeRing, distanceKm, layersContaining } from "../src/lib/geo";
const layer = { baseFl: 0, topFl: 200, polygon: [[104, -5], [107, -5], [107, -8], [104, -8]] as [number, number][], movement: null };
describe("geo", () => {
  it("closeRing repeats the first point", () => { expect(closeRing(layer.polygon).at(-1)).toEqual([104, -5]); });
  it("detects containment", () => {
    expect(layersContaining(105.4, -6.1, [layer])).toHaveLength(1);
    expect(layersContaining(110, -6.1, [layer])).toHaveLength(0);
  });
  it("distance Jakarta to volcano is about 150 km", () => { expect(distanceKm(106.8456, -6.2088, 105.423, -6.102)).toBeGreaterThan(140); expect(distanceKm(106.8456, -6.2088, 105.423, -6.102)).toBeLessThan(165); });
});
```
- [ ] **Step 2: Run** → fail. **Step 3: Implement**
```ts
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import distance from "@turf/distance";
import { point, polygon as turfPolygon } from "@turf/helpers";
import type { AshLayer, LonLat } from "./schema";
export function closeRing(ring: LonLat[]): LonLat[] {
  const first = ring[0], last = ring[ring.length - 1];
  if (!first || !last) return ring;
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}
export function layersContaining(lon: number, lat: number, layers: AshLayer[]): AshLayer[] {
  const p = point([lon, lat]);
  return layers.filter((l) => l.polygon.length >= 3 && booleanPointInPolygon(p, turfPolygon([closeRing(l.polygon)])));
}
export function distanceKm(aLon: number, aLat: number, bLon: number, bLat: number): number {
  return distance(point([aLon, aLat]), point([bLon, bLat]), { units: "kilometers" });
}
```
- [ ] **Step 4: Run** → pass. **Step 5: Commit** `feat: add point-in-polygon and distance helpers`

---
### Task 8: Front-end shell: config, i18n, HTML, CSS

**Files:** Create `src/config.ts`, `src/i18n.ts`, `index.html`, `src/style.css`, `public/brand/niriksagara.png` (copy from `../niriksagara-react/niriksagara-react/public/logo.png`), `public/favicon.svg`, `public/manifest.webmanifest`.

**Interfaces:**
- `src/config.ts` re-exports `VOLCANO` from `src/lib/volcano.ts` and exports `DATA_URL`, `REFRESH_MS = 300000`, `STALE_WARN_MIN = 180`, `STALE_BAD_MIN = 720`, `BASEMAP = { url, attribution, subdomains, maxZoom }`, `SATELLITE = { layer, urlTemplate, maxNativeZoom: 6, attribution }`, `OPEN_METEO_URL`, `LINKS = { magma, bmkg, vaac, source }`, `COLORS = { navy, amber, purple }`, `INITIAL_VIEW = { center: [-6.4, 105.6], zoom: 7 }`.
- `src/i18n.ts` exports `type Locale`, `getLocale(): Locale` (from `localStorage` key `krakatau.locale`, default `id`), `setLocale(l)`, `t(key: StringKey, vars?: Record<string, string | number>): string`, `STRINGS` typed as `Record<Locale, Record<StringKey, string>>`. Keys: `appTitle`, `subtitle`, `updated`, `noAdvisory`, `stepNow`, `stepPlus`, `observedAt`, `forecastFor`, `layerLow`, `layerHigh`, `altitudeTop`, `moving`, `alertLevel`, `vonaCode`, `advisoryNo`, `issued`, `nextAdvisory`, `ashTop`, `wind`, `windSurface`, `windLow`, `windMid`, `windHigh`, `windUnavailable`, `checkLocation`, `locating`, `locationDenied`, `insideAsh`, `outsideAsh`, `distanceFrom`, `forecastCaveat`, `safetyTitle`, `safety1`..`safety5`, `officialLinks`, `share`, `copied`, `madeBy`, `dataFrom`, `satellite`, `satelliteFrame`, `windToggle`, `loadError`, `retry`, `sourceWarn`, `play`, `pause`, `language`, `expand`, `collapse`.
- `index.html` has `<div id="map">`, `<header class="topbar">` (title, freshness pill `#freshness`, lang button `#lang`), `<div class="map-controls">` (`#toggle-sat`, `#toggle-wind`, `#locate`), `<div class="time-chips" id="time-chips">`, `<section class="sheet" id="sheet">` with handle, `#status`, `#wind-card`, `#location-result`, `#safety`, `#links`, `#share`, footer with logo. Also `<div id="banner" hidden>` for load errors. OG meta tags with title "Sebaran Abu Krakatau", description, `og:image` `./og.png`, `theme-color #00253f`, manifest link, favicon link, Leaflet CSS imported from `leaflet/dist/leaflet.css` in `main.ts`.
- `style.css`: CSS variables for brand colours, mobile-first layout: map fixed full-screen; topbar overlay with backdrop blur; bottom sheet with two states (`collapsed` 64 px peek, `expanded` up to 70 vh) toggled by click on handle and drag (pointer events with 40 px threshold); time chips pinned above sheet; controls stacked on the right; `prefers-reduced-motion` disables pulse animation; safe-area insets; min tap target 44 px.

- [ ] Steps: write the four files, run `npm run build` (empty main is fine), check the page renders a map placeholder in the browser, commit `feat: add page shell, styles and i18n strings`.

---

### Task 9: Map layers

**Files:** Create `src/map/map.ts`, `src/map/ash-layer.ts`, `src/map/satellite-layer.ts`, `src/map/wind.ts`.

**Interfaces:**
- `createMap(el: HTMLElement): L.Map` — Leaflet map with `BASEMAP` tile layer, zoom control bottom-left disabled on touch, attribution control, volcano marker (`L.divIcon` with class `volcano-marker` containing a pulsing ring) at `VOLCANO`, bound popup with name and elevation.
- `class AshLayer { constructor(map: L.Map); show(step: TimeStep | null): void; clear(): void }` where `TimeStep = { label: string; time: string; layers: AshLayer[] }`. Styles: `topFl < 250` → amber fill 0.35, stroke amber; else purple fill 0.25, stroke purple; high layer drawn first so low layer sits on top. Popup on tap shows `altitudeTop`, `moving` with direction and speed converted to km/h (`kt * 1.852`). Renders with `L.polygon(closeRing(...).map(([lon, lat]) => [lat, lon]))`. `fitBounds` on the first show with padding, only once per page load.
- `class SatelliteLayer { constructor(map: L.Map); setVisible(v: boolean): void; isVisible(): boolean }` using `L.tileLayer(SATELLITE.urlTemplate, { maxNativeZoom: 6, maxZoom: 19, opacity: 0.65, attribution })` with the time `default`. Tile URL: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Himawari_AHI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`. Add `pane` `satellite` with z-index 350 so it sits under polygons (overlayPane is 400).
- `fetchWind(signal?: AbortSignal): Promise<WindReport>` where `WindReport = { time: string; levels: { key: "surface" | "low" | "mid" | "high"; approxKm: number; speedKmh: number; directionDeg: number }[] }`. Query Open-Meteo with `hourly=wind_speed_10m,wind_direction_10m,wind_speed_850hPa,wind_direction_850hPa,wind_speed_500hPa,wind_direction_500hPa,wind_speed_250hPa,wind_direction_250hPa&forecast_days=1&timezone=UTC`, validate with a Zod schema (arrays of numbers/nulls), pick the hour closest to now. `approxKm`: surface 0, 850 hPa 1.5, 500 hPa 5.5, 250 hPa 10.5. `renderWindCard(el: HTMLElement, report: WindReport | null): void` renders four rows: label, an arrow rotated by `directionDeg + 180` (wind blows toward), speed. Wind direction in meteorology is where wind comes FROM; ash moves TOWARD `directionDeg + 180`. Show text "abu bergerak ke <compass>" using 8-point compass of the toward direction.
- `class WindLayer { constructor(map: L.Map); show(report: WindReport): void; setVisible(v: boolean): void }` draws up to four `L.polyline` arrows from the volcano in the "toward" direction, length proportional to speed (min 15 km, 1 km per km/h, cap 120 km), colour by height (surface grey, low amber, mid orange, high purple), with a tooltip label of height and speed.

- [ ] Steps: implement each file, `npm run typecheck`, check in the browser that polygons draw for the committed snapshot and satellite toggles, commit `feat: add map, ash polygons, satellite and wind layers`.

---

### Task 10: UI components and wiring

**Files:** Create `src/ui/sheet.ts`, `src/ui/status-card.ts`, `src/ui/time-chips.ts`, `src/ui/location-check.ts`, `src/ui/share.ts`, `src/main.ts`.

**Interfaces:**
- `initSheet(el: HTMLElement): { expand(); collapse(); toggle() }` — handle click toggles; pointer drag beyond 40 px vertical switches state.
- `renderStatus(el: HTMLElement, data: LatestData, now: Date, locale: Locale): void` — alert level badge (colour: 1 green, 2 yellow, 3 orange, 4 red), VONA colour chip + relative time + text (clamped to 3 lines with expand), max `topFl` across observation layers as `ashTop`, `advisoryNo`, `issued` (WIB), `nextAdvisory` (WIB), warning line if `sourceErrors.length > 0`, and `noAdvisory` state when `vaac` is null.
- `renderFreshness(el: HTMLElement, generatedAt: string, now: Date, locale): void` — text `updated` + relative; class `ok`/`warn`/`bad` by `STALE_WARN_MIN`/`STALE_BAD_MIN`.
- `buildSteps(adv: Advisory, locale): TimeStep[]` — observation as `stepNow` (with observed WIB clock) then forecasts as `+6 j` etc. `initTimeChips(el, steps, onChange: (index: number) => void): { setIndex(i); startPlay(); stopPlay() }` — play cycles every 1500 ms; chips are `<button role="tab">`.
- `initLocationCheck(button: HTMLElement, resultEl: HTMLElement, getStep: () => TimeStep | null, locale)` — `navigator.geolocation.getCurrentPosition` with 10 s timeout; result: distance km to volcano, inside/outside for selected step, and `forecastCaveat`. Also drops an `L.circleMarker` on the map via a passed callback `onLocated(lat, lon)`.
- `initShare(button: HTMLElement, locale)` — `navigator.share({ title, text, url })` when available, else `navigator.clipboard.writeText(location.href)` and show `copied` for 2 s.
- `main.ts`: import `leaflet/dist/leaflet.css` and `./style.css`; create map and layers; `loadData()` fetches `DATA_URL` with `cache: "no-store"`, validates with `latestDataSchema`, on failure shows banner with retry; on success renders status, freshness, steps, first step shown; `setInterval(loadData, REFRESH_MS)`; freshness re-rendered every 60 s; wind fetched once at boot and again every 30 min; toggles wire `SatelliteLayer.setVisible` and `WindLayer.setVisible` with `aria-pressed`; language toggle calls `setLocale` and `location.reload()`; document `lang` attribute set from locale.

- [ ] Steps: implement, `npm run typecheck && npm test && npm run build`, browser check on a 390 px wide viewport with a screenshot, commit `feat: wire status, time steps, location check and sharing`.

---

### Task 11: Assets, workflow, README

**Files:** Create `public/og.png` (1200x630 generated with a small Python/PIL script: navy background, title text, amber plume shape), `.github/workflows/update-and-deploy.yml`, `README.md`.

Workflow:
```yaml
name: Update data and deploy
on:
  schedule: [{ cron: "*/15 * * * *" }]
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: write, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: false }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm test
      - run: npm run fetch
      - name: Commit refreshed data
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add public/data/latest.json
          git diff --cached --quiet || git commit -m "chore: refresh ash advisory data"
          git push
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
README covers: what it is, data sources and their update cadence, `npm run dev`, `npm run fetch`, deploy to GitHub Pages (enable Pages "GitHub Actions" source; optional custom domain via `public/CNAME`), disclaimer wording, licence (MIT), credits.

- [ ] Steps: create files, commit `ci: add scheduled data refresh and pages deploy` and `docs: add README`.

---

### Task 12: Verification and review

- [ ] `npm test`, `npm run typecheck`, `npm run build` all pass; paste output summary.
- [ ] Serve `dist/` with `npx vite preview` and capture a mobile screenshot with the puppeteer MCP tool (390x844) and a desktop one; fix visual defects.
- [ ] Run the `code-reviewer` agent on the diff; address findings.
- [ ] Final commit.
