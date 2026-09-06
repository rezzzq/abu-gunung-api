import {
  latestDataSchema,
  type Advisory,
  type LatestData,
  type MagmaStatus,
  type SatelliteInfo,
} from "./schema";
import { toIso } from "./time";
import { VOLCANO } from "./volcano";

export type SourceResult<T> = { status: "ok"; value: T } | { status: "failed"; error: string };

export interface BuildInput {
  now: Date;
  /** The newest Krakatau advisory, or null when every file was read and none matched. */
  vaac: SourceResult<Advisory | null>;
  /** Per-file fetch or parse problems that did not stop the whole VAAC step. */
  vaacPartialFailures: string[];
  magma: SourceResult<MagmaStatus>;
  satellite: SourceResult<SatelliteInfo>;
  previous: LatestData | null;
}

/**
 * Assembles the document the front end reads. A transient outage must not
 * blank the ash map, so when the advisory source failed, or returned nothing
 * while some files were unreadable, the previous advisory is kept and the
 * reason is recorded in sourceErrors.
 */
export function buildLatest(input: BuildInput): LatestData {
  const errors: string[] = [];
  let vaac: Advisory | null;
  if (input.vaac.status === "failed") {
    vaac = input.previous?.vaac ?? null;
    errors.push(
      vaac
        ? `vaac: kept previous advisory ${vaac.header} because fetch failed: ${input.vaac.error}`
        : `vaac: ${input.vaac.error}`,
    );
  } else if (input.vaac.value === null && input.vaacPartialFailures.length > 0 && input.previous?.vaac) {
    vaac = input.previous.vaac;
    errors.push(
      `vaac: kept previous advisory ${vaac.header} because no Krakatau advisory was found and some files failed: ${input.vaacPartialFailures.join("; ")}`,
    );
  } else {
    vaac = input.vaac.value;
    for (const failure of input.vaacPartialFailures) errors.push(`vaac: ${failure}`);
  }

  let magma: MagmaStatus | null = null;
  if (input.magma.status === "ok") magma = input.magma.value;
  else errors.push(`magma: ${input.magma.error}`);

  let satellite: SatelliteInfo | null = null;
  if (input.satellite.status === "ok") satellite = input.satellite.value;
  else errors.push(`satellite: ${input.satellite.error}`);

  return latestDataSchema.parse({
    generatedAt: toIso(input.now),
    volcano: VOLCANO,
    vaac,
    magma,
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
