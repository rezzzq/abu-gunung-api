/**
 * Scheduled job: pulls every current Darwin VAAC advisory for Indonesia, the
 * PVMBG alert levels and latest VONAs from MAGMA Indonesia, and the latest
 * Himawari frame time from NASA GIBS, then writes public/data/latest.json.
 *
 * Network I/O lives here; all parsing is in src/lib and covered by tests.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildLatest, extractLatestFrameTime, type MagmaSnapshot, type SourceResult } from "../src/lib/build-latest";
import { parseActivityLevels, parseVonas } from "../src/lib/magma-parser";
import { latestDataSchema, type Advisory, type LatestData, type SatelliteInfo } from "../src/lib/schema";
import { parseAllAdvisories } from "../src/lib/vaa-parser";

const OUT = resolve(process.cwd(), "public/data/latest.json");
const NOAA_BASE = "https://tgftp.nws.noaa.gov/data/raw/fv/";
const NOAA_FILES = Array.from({ length: 8 }, (_, i) => `fvau0${i + 1}.adrm..txt`);
const MAGMA_LEVEL_URL = "https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas";
const MAGMA_VONA_URL = "https://magma.esdm.go.id/v1/vona";
const GIBS_CAPS_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml";
const GIBS_LAYER = "Himawari_AHI_Band13_Clean_Infrared";
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

async function fetchVaac(): Promise<{ result: SourceResult<Advisory[]>; partialFailures: string[] }> {
  const settled = await Promise.allSettled(NOAA_FILES.map((file) => fetchText(NOAA_BASE + file)));
  const partialFailures: string[] = [];
  const advisories: Advisory[] = [];
  let fetchFailures = 0;
  settled.forEach((s, i) => {
    const name = NOAA_FILES[i]!;
    if (s.status === "rejected") {
      fetchFailures += 1;
      partialFailures.push(`${name}: ${errorMessage(s.reason)}`);
      return;
    }
    const parsed = parseAllAdvisories(s.value);
    for (const f of parsed.failures) partialFailures.push(`${name}: ${f.header}: ${f.reason}`);
    advisories.push(...parsed.advisories);
  });
  if (fetchFailures === NOAA_FILES.length) {
    return { result: { status: "failed", error: partialFailures.join("; ") }, partialFailures: [] };
  }
  return { result: { status: "ok", value: advisories }, partialFailures };
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
  const [previous, vaac, magma, satellite] = await Promise.all([readPrevious(), fetchVaac(), fetchMagma(), fetchSatellite()]);
  const data = buildLatest({
    now,
    advisories: vaac.result,
    vaacPartialFailures: vaac.partialFailures,
    magma,
    satellite,
    previous,
  });
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  for (const e of data.sourceErrors) console.error(`warning: ${e}`);
  const summary = data.volcanoes
    .map((v) => `${v.id}${v.active ? "*" : ""}(L${v.activityLevel?.level ?? "?"})`)
    .join(" ");
  console.info(`wrote ${OUT}: volcanoes=${summary || "none"} sat=${data.satellite?.latestFrameTime ?? "?"}`);
  if (data.volcanoes.length === 0 && data.satellite === null) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(`fatal: ${errorMessage(e)}`);
  process.exitCode = 1;
});
