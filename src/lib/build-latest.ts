import { isTerminated } from "./vaa-parser";
import { latestVonaFor, type VonaWithVolcano } from "./magma-parser";
import {
  latestDataSchema,
  type ActivityLevel,
  type Advisory,
  type LatestData,
  type SatelliteInfo,
  type VolcanoStatus,
} from "./schema";
import { toIso } from "./time";
import { byMagmaName, resolveVolcano } from "./volcanoes";

export type SourceResult<T> = { status: "ok"; value: T } | { status: "failed"; error: string };

export interface MagmaSnapshot {
  /** PVMBG level per MAGMA volcano name. */
  levels: Map<string, ActivityLevel>;
  /** Every VONA on the all-volcano page, newest first. */
  vonas: VonaWithVolcano[];
}

export interface BuildInput {
  now: Date;
  /** Every advisory parsed from every VAAC file. */
  advisories: SourceResult<Advisory[]>;
  /** Per-file fetch or parse problems that did not stop the whole VAAC step. */
  vaacPartialFailures: string[];
  magma: SourceResult<MagmaSnapshot>;
  satellite: SourceResult<SatelliteInfo>;
  previous: LatestData | null;
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

/** Newest advisory per VAAC volcano field. */
function newestPerVolcano(advisories: Advisory[]): Map<string, Advisory> {
  const byName = new Map<string, Advisory>();
  for (const adv of advisories) {
    const key = adv.volcano.trim().toUpperCase();
    const current = byName.get(key);
    if (!current || adv.issuedAt > current.issuedAt) byName.set(key, adv);
  }
  return byName;
}

/**
 * Assembles the document the front end reads. A transient outage must not
 * blank the map, so a failed VAAC fetch keeps the previous volcano list and a
 * failed MAGMA fetch keeps the previous levels and VONAs, with the reason in
 * sourceErrors.
 */
export function buildLatest(input: BuildInput): LatestData {
  const errors: string[] = [];
  const previousById = new Map((input.previous?.volcanoes ?? []).map((v) => [v.id, v]));

  let magma: MagmaSnapshot | null = null;
  if (input.magma.status === "ok") magma = input.magma.value;
  else errors.push(`magma: ${input.magma.error}`);

  const status = (
    adv: Advisory | null,
    info: ReturnType<typeof resolveVolcano>,
    position: { lat: number; lon: number },
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
      vaac: adv,
      active: fresh && adv !== null && !isTerminated(adv),
      activityLevel: magma ? (magmaName ? magma.levels.get(magmaName) ?? null : null) : previous?.activityLevel ?? null,
      latestVona: magma ? (magmaName ? latestVonaFor(magma.vonas, magmaName) : null) : previous?.latestVona ?? null,
    };
  };

  let volcanoes: VolcanoStatus[];
  if (input.advisories.status === "failed") {
    volcanoes = (input.previous?.volcanoes ?? []).map((v) =>
      status(v.vaac, { ...resolveVolcano(v.vaac?.volcano ?? v.name), id: v.id, name: v.name, region: v.region }, v),
    );
    errors.push(
      volcanoes.length
        ? `vaac: kept previous volcano list because fetch failed: ${input.advisories.error}`
        : `vaac: ${input.advisories.error}`,
    );
  } else {
    for (const failure of input.vaacPartialFailures) errors.push(`vaac: ${failure}`);
    volcanoes = [];
    for (const adv of newestPerVolcano(input.advisories.value).values()) {
      const info = resolveVolcano(adv.volcano);
      const position = adv.position ?? (info.lat !== null && info.lon !== null ? { lat: info.lat, lon: info.lon } : null);
      if (!position) {
        errors.push(`vaac: skipped ${info.name}: no position in the advisory or the volcano table`);
        continue;
      }
      volcanoes.push(status(adv, info, position));
    }
  }

  // Level III/IV volcanoes without an advisory still get a marker.
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

  return latestDataSchema.parse({
    generatedAt: toIso(input.now),
    volcanoes,
    magmaFetchedAt: magma ? toIso(input.now) : null,
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
