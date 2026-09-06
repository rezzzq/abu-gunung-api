/**
 * Scheduled job: pulls every current Darwin VAAC advisory for Indonesia from
 * the Bureau of Meteorology archive and the NOAA mirror, the PVMBG alert
 * levels and latest VONAs from MAGMA Indonesia, airport METARs, NOTAMs when a
 * key exists, and the latest Himawari frame time from NASA GIBS, then writes
 * public/data/latest.json and the VAAC graphics under public/data/vag/.
 *
 * Network I/O lives here; all parsing is in src/lib and covered by tests.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { AIRPORTS } from "../src/lib/airports";
import { graphicNameFor, newestPerProduct, parseListing } from "../src/lib/bom-vaac";
import {
  buildLatest,
  extractLatestFrameTime,
  type MagmaSnapshot,
  type NotamResult,
  type RawMetar,
  type SourceResult,
  type TaggedAdvisory,
} from "../src/lib/build-latest";
import { summarizeNotams } from "../src/lib/notam-parser";
import { parseActivityLevels, parseVonas } from "../src/lib/magma-parser";
import { latestDataSchema, type LatestData, type SatelliteInfo } from "../src/lib/schema";
import { parseAllAdvisories } from "../src/lib/vaa-parser";
import { resolveVolcano } from "../src/lib/volcanoes";

const resolveId = (vaacField: string): string => resolveVolcano(vaacField).id;

const OUT = resolve(process.cwd(), "public/data/latest.json");
const VAG_DIR = resolve(process.cwd(), "public/data/vag");
// Bureau of Meteorology anonymous archive: every Darwin advisory and graphic, ten product slots.
const BOM_FTP = "ftp://ftp.bom.gov.au/anon/gen/vaac/";
const NOAA_BASE = "https://tgftp.nws.noaa.gov/data/raw/fv/";
const NOAA_FILES = Array.from({ length: 8 }, (_, i) => `fvau0${i + 1}.adrm..txt`);
const execFileAsync = promisify(execFile);
const MAGMA_LEVEL_URL = "https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas";
const MAGMA_VONA_URL = "https://magma.esdm.go.id/v1/vona";
const GIBS_CAPS_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml";
const GIBS_LAYER = "Himawari_AHI_Band13_Clean_Infrared";
// FAA NOTAM API: needs a free developer key (client id and secret) in the environment.
const NOTAM_URL = "https://external-api.faa.gov/notamapi/v1/notams";
const NOTAM_CLIENT_ID = process.env.FAA_NOTAM_CLIENT_ID;
const NOTAM_CLIENT_SECRET = process.env.FAA_NOTAM_CLIENT_SECRET;
// NOAA Aviation Weather Center: latest METAR per station, no key needed.
const METAR_URL = `https://aviationweather.gov/api/data/metar?format=json&ids=${AIRPORTS.map((a) => a.icao).join(",")}`;
// MAGMA answers 403 to non-browser user agents. Identify the project after the browser token.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 abu-gunung-api/0.2 (+https://niriksagara.id)";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "user-agent": USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Node's fetch has no FTP, so the BoM archive is read with curl, which every runner and dev box has. */
async function curlFtp(url: string, extra: string[] = [], timeoutMs = 60_000): Promise<Buffer> {
  const { stdout } = await execFileAsync("curl", ["-sS", "--fail", "--max-time", String(Math.ceil(timeoutMs / 1000)), ...extra, url], {
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

interface BomFetch {
  advisories: TaggedAdvisory[];
  /** Graphic file name per volcano field, downloaded later for the volcanoes that stay active. */
  graphics: Map<string, { name: string; stamp: string }>;
}

/** Newest advisory in each BoM product slot for this year (and last year's slots in January). */
async function fetchBomVaac(now: Date): Promise<{ result: SourceResult<BomFetch>; partialFailures: string[] }> {
  const partialFailures: string[] = [];
  const years = [now.getUTCFullYear()];
  if (now.getUTCMonth() === 0) years.push(now.getUTCFullYear() - 1);
  const advisories: TaggedAdvisory[] = [];
  const graphics = new Map<string, { name: string; stamp: string }>();
  try {
    const listings = await Promise.all(years.map((y) => curlFtp(`${BOM_FTP}${y}/`, ["--list-only"]).then((b) => ({ y, text: b.toString("utf8") }))));
    const newest = newestPerProduct(listings.flatMap(({ text }) => parseListing(text)));
    const yearOf = (stamp: string): string => stamp.slice(0, 4);
    await Promise.all(
      [...newest.values()].map(async (file) => {
        try {
          const text = (await curlFtp(`${BOM_FTP}${yearOf(file.stamp)}/${file.name}`)).toString("utf8");
          const parsed = parseAllAdvisories(text);
          for (const f of parsed.failures) partialFailures.push(`bom ${file.name}: ${f.header}: ${f.reason}`);
          for (const advisory of parsed.advisories) {
            const graphic = graphicNameFor(file.name);
            advisories.push({ advisory, source: "bom", graphic: graphic ? `vag/${resolveId(advisory.volcano)}.png?v=${file.stamp}` : null });
            if (graphic) graphics.set(advisory.volcano.trim().toUpperCase(), { name: `${yearOf(file.stamp)}/${graphic}`, stamp: file.stamp });
          }
        } catch (e) {
          partialFailures.push(`bom ${file.name}: ${errorMessage(e)}`);
        }
      }),
    );
  } catch (e) {
    return { result: { status: "failed", error: `bom: ${errorMessage(e)}` }, partialFailures };
  }
  return { result: { status: "ok", value: { advisories, graphics } }, partialFailures };
}

async function fetchNoaaVaac(): Promise<{ result: SourceResult<TaggedAdvisory[]>; partialFailures: string[] }> {
  const settled = await Promise.allSettled(NOAA_FILES.map((file) => fetchText(NOAA_BASE + file)));
  const partialFailures: string[] = [];
  const advisories: TaggedAdvisory[] = [];
  let fetchFailures = 0;
  settled.forEach((s, i) => {
    const name = NOAA_FILES[i]!;
    if (s.status === "rejected") {
      fetchFailures += 1;
      partialFailures.push(`noaa ${name}: ${errorMessage(s.reason)}`);
      return;
    }
    const parsed = parseAllAdvisories(s.value);
    for (const f of parsed.failures) partialFailures.push(`noaa ${name}: ${f.header}: ${f.reason}`);
    for (const advisory of parsed.advisories) advisories.push({ advisory, source: "noaa", graphic: null });
  });
  if (fetchFailures === NOAA_FILES.length) {
    return { result: { status: "failed", error: `noaa: ${partialFailures.join("; ")}` }, partialFailures: [] };
  }
  return { result: { status: "ok", value: advisories }, partialFailures };
}

/** Both sources together; the builder keeps the newest per volcano. Only a total outage counts as failure. */
async function fetchVaac(now: Date): Promise<{ result: SourceResult<TaggedAdvisory[]>; partialFailures: string[]; graphics: BomFetch["graphics"] }> {
  const [bom, noaa] = await Promise.all([fetchBomVaac(now), fetchNoaaVaac()]);
  const partialFailures = [...bom.partialFailures, ...noaa.partialFailures];
  const advisories: TaggedAdvisory[] = [];
  const failures: string[] = [];
  if (bom.result.status === "ok") advisories.push(...bom.result.value.advisories);
  else failures.push(bom.result.error);
  if (noaa.result.status === "ok") advisories.push(...noaa.result.value);
  else failures.push(noaa.result.error);
  if (failures.length === 2) return { result: { status: "failed", error: failures.join("; ") }, partialFailures: [], graphics: new Map() };
  for (const f of failures) partialFailures.push(f);
  return { result: { status: "ok", value: advisories }, partialFailures, graphics: bom.result.status === "ok" ? bom.result.value.graphics : new Map() };
}

/**
 * Downloads the official VAAC graphic for each active volcano and clears the field
 * for any that could not be fetched, so the page never links to a missing picture.
 */
async function fetchGraphics(volcanoes: LatestData["volcanoes"], graphics: BomFetch["graphics"]): Promise<void> {
  await mkdir(VAG_DIR, { recursive: true });
  for (const v of volcanoes) {
    if (!v.graphic) continue;
    const key = v.vaac?.volcano.trim().toUpperCase();
    const g = key ? graphics.get(key) : undefined;
    if (!v.active || !g) {
      v.graphic = null;
      continue;
    }
    try {
      const png = await curlFtp(`${BOM_FTP}${g.name}`);
      await writeFile(resolve(VAG_DIR, `${v.id}.png`), png);
    } catch (e) {
      console.error(`warning: vag ${v.id}: ${errorMessage(e)}`);
      v.graphic = null;
    }
  }
}

/** Both MAGMA pages must load: a missing level table would silently drop every Level III marker. */
async function fetchMagma(): Promise<SourceResult<MagmaSnapshot>> {
  const [level, vona] = await Promise.allSettled([fetchText(MAGMA_LEVEL_URL), fetchText(MAGMA_VONA_URL)]);
  const problems: string[] = [];
  if (level.status === "rejected") problems.push(`levels: ${errorMessage(level.reason)}`);
  if (vona.status === "rejected") problems.push(`vona: ${errorMessage(vona.reason)}`);
  if (level.status === "rejected" || vona.status === "rejected") return { status: "failed", error: problems.join("; ") };
  const levels = parseActivityLevels(level.value);
  if (levels.size === 0) return { status: "failed", error: "levels: no volcano rows found on the MAGMA page" };
  return { status: "ok", value: { levels, vonas: parseVonas(vona.value) } };
}

async function fetchSatellite(): Promise<SourceResult<SatelliteInfo>> {
  try {
    const xml = await fetchText(GIBS_CAPS_URL, 60_000);
    return { status: "ok", value: { layer: GIBS_LAYER, latestFrameTime: extractLatestFrameTime(xml, GIBS_LAYER) } };
  } catch (e) {
    return { status: "failed", error: errorMessage(e) };
  }
}

async function fetchMetars(): Promise<SourceResult<RawMetar[]>> {
  try {
    const text = await fetchText(METAR_URL, 30_000);
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("unexpected METAR payload");
    const reports: RawMetar[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const { icaoId, rawOb } = item as { icaoId?: unknown; rawOb?: unknown };
      if (typeof icaoId === "string" && typeof rawOb === "string") reports.push({ icao: icaoId, raw: rawOb });
    }
    return { status: "ok", value: reports };
  } catch (e) {
    return { status: "failed", error: errorMessage(e) };
  }
}

/** One request per airport; the API pages at 50 items, more than any airport carries. */
async function fetchNotams(now: Date): Promise<SourceResult<NotamResult[]> | { status: "skipped" }> {
  if (!NOTAM_CLIENT_ID || !NOTAM_CLIENT_SECRET) return { status: "skipped" };
  const headers = { client_id: NOTAM_CLIENT_ID, client_secret: NOTAM_CLIENT_SECRET, "user-agent": USER_AGENT };
  const results: NotamResult[] = [];
  const failures: string[] = [];
  for (const airport of AIRPORTS) {
    const url = `${NOTAM_URL}?icaoLocation=${airport.icao}&responseFormat=geoJson&pageSize=50`;
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: unknown = await res.json();
      const items = typeof body === "object" && body !== null && Array.isArray((body as { items?: unknown }).items) ? (body as { items: unknown[] }).items : [];
      results.push({ icao: airport.icao, status: summarizeNotams(items, now) });
    } catch (e) {
      failures.push(`${airport.icao}: ${errorMessage(e)}`);
    }
  }
  if (!results.length) return { status: "failed", error: failures.join("; ") || "no airports answered" };
  if (failures.length) console.error(`warning: notam: ${failures.join("; ")}`);
  return { status: "ok", value: results };
}

/** A missing or invalid previous file is a normal state (first run), not an error. */
async function readPrevious(): Promise<LatestData | null> {
  let text: string;
  try {
    text = await readFile(OUT, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = latestDataSchema.safeParse(JSON.parse(text));
    if (!parsed.success) console.error(`warning: ignoring invalid previous ${OUT}: ${parsed.error.message}`);
    return parsed.success ? parsed.data : null;
  } catch (e) {
    console.error(`warning: ignoring unreadable previous ${OUT}: ${errorMessage(e)}`);
    return null;
  }
}

async function main(): Promise<void> {
  const now = new Date();
  const [previous, vaac, magma, satellite, metars, notams] = await Promise.all([
    readPrevious(),
    fetchVaac(now),
    fetchMagma(),
    fetchSatellite(),
    fetchMetars(),
    fetchNotams(now),
  ]);
  const data = buildLatest({
    now,
    advisories: vaac.result,
    vaacPartialFailures: vaac.partialFailures,
    magma,
    satellite,
    metars,
    notams,
    previous,
  });
  await fetchGraphics(data.volcanoes, vaac.graphics);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  for (const e of data.sourceErrors) console.error(`warning: ${e}`);
  for (const n of data.notes) console.info(`note: ${n}`);
  const summary = data.volcanoes
    .map((v) => `${v.id}${v.active ? "*" : ""}(L${v.activityLevel?.level ?? "?"}${v.advisorySource ? `,${v.advisorySource}` : ""})`)
    .join(" ");
  const ashAirports = data.airports.filter((a) => a.ash).map((a) => a.iata).join(",");
  const closed = data.airports.filter((a) => a.notam?.closed).map((a) => a.iata).join(",");
  console.info(
    `wrote ${OUT}: volcanoes=${summary || "none"} ashAtAirports=${ashAirports || "none"} closed=${notams.status === "skipped" ? "no-key" : closed || "none"} sat=${data.satellite?.latestFrameTime ?? "?"}`,
  );
  if (data.volcanoes.length === 0 && data.satellite === null) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(`fatal: ${errorMessage(e)}`);
  process.exitCode = 1;
});
