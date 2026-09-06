import { advisoryProblems, isIndonesian, isStale } from "./advisory-check";
import { AIRPORTS } from "./airports";
import { latestVonaFor, type VonaWithVolcano } from "./magma-parser";
import { parseMetar } from "./metar-parser";
import type { NotamStatus } from "./notam-parser";
import {
  latestDataSchema,
  type ActivityLevel,
  type Advisory,
  type AirportStatus,
  type LatestData,
  type SatelliteInfo,
  type VolcanoStatus,
} from "./schema";
import { toIso } from "./time";
import { isTerminated } from "./vaa-parser";
import { byMagmaName, resolveVolcano, zoneForLongitude } from "./volcanoes";

export type SourceResult<T> = { status: "ok"; value: T } | { status: "failed"; error: string };

export interface MagmaSnapshot {
  /** PVMBG level per MAGMA volcano name. */
  levels: Map<string, ActivityLevel>;
  /** Every VONA on the all-volcano page, newest first. */
  vonas: VonaWithVolcano[];
}

export interface RawMetar {
  icao: string;
  raw: string;
}

export interface NotamResult {
  icao: string;
  status: NotamStatus;
}

export interface TaggedAdvisory {
  advisory: Advisory;
  source: "bom" | "noaa";
  /** data/-relative path of the BoM graphic for this advisory, when known. */
  graphic: string | null;
}

export interface BuildInput {
  now: Date;
  /** Every advisory parsed from every source file, tagged with its source. */
  advisories: SourceResult<TaggedAdvisory[]>;
  /** Per-file fetch or parse problems that did not stop the whole VAAC step. */
  vaacPartialFailures: string[];
  magma: SourceResult<MagmaSnapshot>;
  satellite: SourceResult<SatelliteInfo>;
  /** Latest METAR per reporting airport; airports without a report are simply absent. */
  metars: SourceResult<RawMetar[]>;
  /** NOTAM facts per airport; "skipped" when no API key is configured. */
  notams: SourceResult<NotamResult[]> | { status: "skipped" };
  previous: LatestData | null;
}

/** Every airport in the table, with its parsed report when one exists. */
function buildAirports(metars: RawMetar[], now: Date, notams: Map<string, NotamStatus> | null): AirportStatus[] {
  const byIcao = new Map(metars.map((m) => [m.icao, m.raw]));
  return AIRPORTS.map((a) => {
    const raw = byIcao.get(a.icao) ?? null;
    const report = raw ? parseMetar(raw, now) : null;
    return {
      ...a,
      observedAt: report?.time ?? null,
      raw,
      visibilityM: report?.visibilityM ?? null,
      weather: report?.weather ?? [],
      ash: report?.ash ?? false,
      notam: notams?.get(a.icao) ?? null,
    };
  });
}

/** An advisory older than this no longer makes a volcano active. */
const FRESH_MS = 24 * 3_600_000;
/** PVMBG levels at or above this appear on the map even without an advisory. */
const MARKER_LEVEL = 3;

function maxTopFl(advisory: Advisory | null): number {
  if (!advisory) return -1;
  const layers = [...(advisory.observation?.layers ?? []), ...advisory.forecasts.flatMap((f) => f.layers)];
  return layers.reduce((top, l) => Math.max(top, l.topFl), -1);
}

/** Newest advisory per VAAC volcano field, plus a note when the sources disagree on what is newest. */
function newestPerVolcano(advisories: TaggedAdvisory[], notes: string[]): Map<string, TaggedAdvisory> {
  const byName = new Map<string, TaggedAdvisory>();
  const newestBySource = new Map<string, Partial<Record<"bom" | "noaa", string>>>();
  for (const tagged of advisories) {
    const key = tagged.advisory.volcano.trim().toUpperCase();
    const current = byName.get(key);
    if (!current || tagged.advisory.issuedAt > current.advisory.issuedAt) byName.set(key, tagged);
    const seen = newestBySource.get(key) ?? {};
    if (!seen[tagged.source] || tagged.advisory.issuedAt > seen[tagged.source]!) seen[tagged.source] = tagged.advisory.issuedAt;
    newestBySource.set(key, seen);
  }
  for (const [key, seen] of newestBySource) {
    if (seen.bom && seen.noaa && seen.bom !== seen.noaa) {
      const id = resolveVolcano(key).id;
      notes.push(`vaac: ${id} sources differ: noaa newest ${seen.noaa}, bom newest ${seen.bom}; using the newer`);
    }
  }
  return byName;
}

const HISTORY_MAX = 30;

/** Adds the current advisory to the remembered ones, newest first, without duplicates. */
function extendHistory(previous: VolcanoStatus["history"] | undefined, adv: Advisory | null): VolcanoStatus["history"] {
  const entries = [...(previous ?? [])];
  if (adv && !entries.some((h) => h.issuedAt === adv.issuedAt)) {
    const top = maxTopFl(adv);
    const first = adv.observation?.layers.find((l) => l.movement)?.movement ?? null;
    entries.push({ number: adv.advisoryNumber, issuedAt: adv.issuedAt, topFl: top >= 0 ? top : null, direction: first?.direction ?? null });
  }
  return entries.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).slice(0, HISTORY_MAX);
}

/**
 * Assembles the document the front end reads. A transient outage must not
 * blank the map, so a failed VAAC fetch keeps the previous volcano list and a
 * failed MAGMA fetch keeps the previous levels and VONAs, with the reason in
 * sourceErrors.
 */
export function buildLatest(input: BuildInput): LatestData {
  const errors: string[] = [];
  const notes: string[] = [];
  const previousById = new Map((input.previous?.volcanoes ?? []).map((v) => [v.id, v]));

  let magma: MagmaSnapshot | null = null;
  if (input.magma.status === "ok") magma = input.magma.value;
  else errors.push(`magma: ${input.magma.error}`);

  const status = (
    adv: Advisory | null,
    info: ReturnType<typeof resolveVolcano>,
    position: { lat: number; lon: number },
    source: "bom" | "noaa" | null = null,
    graphic: string | null = null,
  ): VolcanoStatus => {
    const previous = previousById.get(info.id);
    const fresh = adv !== null && input.now.getTime() - Date.parse(adv.issuedAt) < FRESH_MS;
    const magmaName = info.magmaName;
    return {
      id: info.id,
      name: info.name,
      gvp: info.gvp ?? previous?.gvp ?? null,
      lat: position.lat,
      lon: position.lon,
      elevationM: adv?.elevationM ?? info.elevationM ?? previous?.elevationM ?? null,
      region: info.region,
      zone: info.magmaName ? info.zone : zoneForLongitude(position.lon),
      vaac: adv,
      advisorySource: adv ? source : null,
      graphic: adv ? graphic : null,
      history: extendHistory(previous?.history, adv),
      active: fresh && adv !== null && !isTerminated(adv),
      activityLevel: magma ? (magmaName ? magma.levels.get(magmaName) ?? null : null) : previous?.activityLevel ?? null,
      latestVona: magma ? (magmaName ? latestVonaFor(magma.vonas, magmaName) : null) : previous?.latestVona ?? null,
    };
  };

  let volcanoes: VolcanoStatus[];
  if (input.advisories.status === "failed") {
    volcanoes = (input.previous?.volcanoes ?? []).map((v) =>
      status(v.vaac, { ...resolveVolcano(v.vaac?.volcano ?? v.name), id: v.id, name: v.name, region: v.region }, v, v.advisorySource, v.graphic),
    );
    errors.push(
      volcanoes.length
        ? `vaac: kept previous volcano list because fetch failed: ${input.advisories.error}`
        : `vaac: ${input.advisories.error}`,
    );
  } else {
    for (const failure of input.vaacPartialFailures) errors.push(`vaac: ${failure}`);
    volcanoes = [];
    for (const tagged of newestPerVolcano(input.advisories.value, notes).values()) {
      let { advisory: adv, source, graphic } = tagged;
      const info = resolveVolcano(adv.volcano);
      // Old bulletins linger in the product slots for weeks; they describe nothing current.
      if (isStale(adv, input.now)) continue;
      if (!isIndonesian(adv) && !info.magmaName) {
        notes.push(`vaac: ignored ${adv.volcano} (area ${adv.area ?? "unknown"})`);
        continue;
      }
      const problems = advisoryProblems(adv, input.now);
      if (problems.length) {
        // A bad bulletin must not replace a good one: fall back to what we showed before.
        const kept = previousById.get(info.id);
        errors.push(`vaac: rejected ${adv.header} for ${adv.volcano} (${problems.join("; ")})${kept?.vaac ? `; kept ${kept.vaac.header}` : ""}`);
        if (!kept?.vaac) continue;
        adv = kept.vaac;
        source = kept.advisorySource ?? source;
        graphic = kept.graphic;
      }
      const position = adv.position ?? (info.lat !== null && info.lon !== null ? { lat: info.lat, lon: info.lon } : null);
      if (!position) {
        errors.push(`vaac: skipped ${info.name}: no position in the advisory or the volcano table`);
        continue;
      }
      volcanoes.push(status(adv, info, position, source, graphic));
    }
  }

  // Level III/IV volcanoes without an advisory still get a marker. When MAGMA is down, the
  // markers we showed before stay, so an outage does not make volcanoes vanish from the map.
  if (!magma) {
    for (const prev of input.previous?.volcanoes ?? []) {
      if (volcanoes.some((v) => v.id === prev.id) || (prev.activityLevel?.level ?? 0) < MARKER_LEVEL) continue;
      volcanoes.push(status(prev.vaac, { ...resolveVolcano(prev.vaac?.volcano ?? prev.name), id: prev.id, name: prev.name, region: prev.region }, prev, prev.advisorySource, prev.graphic));
    }
  }
  if (magma) {
    for (const [magmaName, level] of magma.levels) {
      if (level.level < MARKER_LEVEL || volcanoes.some((v) => resolveVolcano(v.vaac?.volcano ?? "").magmaName === magmaName || v.name === magmaName)) continue;
      const info = byMagmaName(magmaName);
      if (!info || info.lat === null || info.lon === null) {
        errors.push(`magma: ${magmaName} is Level ${level.level} but is not in the volcano table`);
        continue;
      }
      volcanoes.push(status(null, info, { lat: info.lat, lon: info.lon }));
    }
  }

  // Drop volcanoes that neither carry a live advisory nor sit at Level III/IV.
  volcanoes = volcanoes.filter((v) => v.active || (v.activityLevel?.level ?? 0) >= MARKER_LEVEL);
  volcanoes.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const top = maxTopFl(b.active ? b.vaac : null) - maxTopFl(a.active ? a.vaac : null);
    if (top !== 0) return top;
    const level = (b.activityLevel?.level ?? 0) - (a.activityLevel?.level ?? 0);
    return level !== 0 ? level : a.name.localeCompare(b.name);
  });

  let satellite: SatelliteInfo | null = null;
  if (input.satellite.status === "ok") satellite = input.satellite.value;
  else errors.push(`satellite: ${input.satellite.error}`);

  let notams: Map<string, NotamStatus> | null = null;
  if (input.notams.status === "ok") notams = new Map(input.notams.value.map((n) => [n.icao, n.status]));
  else if (input.notams.status === "failed") {
    // Keep yesterday's facts rather than showing nothing: a stale closure is flagged by its end time.
    notams = new Map((input.previous?.airports ?? []).flatMap((a) => (a.notam ? [[a.icao, a.notam] as const] : [])));
    errors.push(`notam: ${notams.size ? "kept previous NOTAMs because fetch failed: " : ""}${input.notams.error}`);
  }

  let airports: AirportStatus[];
  if (input.metars.status === "ok") airports = buildAirports(input.metars.value, input.now, notams);
  else {
    airports = input.previous?.airports?.map((a) => ({ ...a, notam: notams?.get(a.icao) ?? a.notam })) ?? buildAirports([], input.now, notams);
    errors.push(
      input.previous?.airports?.length
        ? `metar: kept previous airport reports because fetch failed: ${input.metars.error}`
        : `metar: ${input.metars.error}`,
    );
  }

  return latestDataSchema.parse({
    generatedAt: toIso(input.now),
    volcanoes,
    airports,
    magmaFetchedAt: magma ? toIso(input.now) : null,
    notes,
    satellite,
    sourceErrors: errors,
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds the default (latest) time of a sub-daily layer in a GIBS WMTS
 * capabilities document. Returns null when the layer is missing or its
 * default is a plain date (daily layers).
 */
export function extractLatestFrameTime(capabilitiesXml: string, layer: string): string | null {
  const layerRe = new RegExp(
    `<Layer>(?:(?!</Layer>)[\\s\\S])*?<ows:Identifier>${escapeRegExp(layer)}</ows:Identifier>(?:(?!</Layer>)[\\s\\S])*?</Layer>`,
  );
  const block = layerRe.exec(capabilitiesXml)?.[0];
  if (!block) return null;
  const def = /<Dimension>[\s\S]*?<Default>([^<]+)<\/Default>/.exec(block)?.[1]?.trim();
  if (!def) return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(def) ? def : null;
}
