import {
  advisorySchema,
  type Advisory,
  type AshLayer,
  type Forecast,
  type LonLat,
  type Observation,
} from "./schema";
import { parseDtg, resolveDayTime, toIso } from "./time";

export type ParseFailure = { header: string; reason: string };
export type ParseResult = { ok: true; advisory: Advisory } | ({ ok: false } & ParseFailure);

/** WMO bulletin header, e.g. "FVAU04 ADRM 060030". */
const HEADER_RE = /^FV[A-Z]{2}\d{2} [A-Z]{4} \d{6}/;
/** "KEY: value" at column 0. Keys may contain digits, spaces, + and / (e.g. "FCST VA CLD +6 HR"). */
const FIELD_RE = /^([A-Z][A-Z0-9 +/]*?):\s?(.*)$/;
/** Start of an ash layer: "SFC/FL200" or "FL200/FL350". */
const LAYER_START_RE = /(SFC|FL(\d{3}))\/FL(\d{3})/g;
/** A latitude/longitude pair in degrees and minutes: "S0504 E10700". */
const COORD_PAIR_RE = /([NS]\d{4}(?:\.\d+)?)\s+([EW]\d{5}(?:\.\d+)?)/g;
const MOVEMENT_RE = /MOV\s+([NSEW]{1,3})\s+(\d{1,3})\s*KT/;
/** Leading "DD/HHMMZ" token in a forecast cloud field. */
const DAYTIME_TOKEN_RE = /^\s*(\d{2}\/\d{4}Z)\s*/;
const FCST_KEY_RE = /^FCST VA CLD \+(\d+)\s?HR$/;
const PSN_RE = /([NS]\d{4}(?:\.\d+)?)\s+([EW]\d{5}(?:\.\d+)?)/;
const ELEV_RE = /(-?\d+)\s*M/i;

/** Splits a file that may hold several bulletins into one string per bulletin. */
export function splitBulletins(text: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (HEADER_RE.test(line)) {
      if (current.length) out.push(current.join("\n"));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) out.push(current.join("\n"));
  return out.map((b) => b.trim()).filter((b) => b.length > 0);
}

/**
 * Turns the "KEY: value" lines of one bulletin into a map. Continuation lines
 * (those starting with whitespace) are joined onto the previous key with a
 * single space. A trailing "=" (end-of-message marker) is removed.
 */
export function parseFields(bulletin: string): Map<string, string> {
  const fields = new Map<string, string>();
  let key: string | null = null;
  for (const raw of bulletin.split(/\r?\n/).slice(1)) {
    const continuation = /^\s/.test(raw);
    const m = continuation ? null : FIELD_RE.exec(raw);
    if (m) {
      key = m[1]!.trim();
      fields.set(key, m[2]!.trim());
    } else if (key && continuation) {
      fields.set(key, `${fields.get(key) ?? ""} ${raw.trim()}`.trim());
    }
  }
  for (const [k, v] of fields) fields.set(k, v.replace(/\s+/g, " ").replace(/=\s*$/, "").trim());
  return fields;
}

/** "S0606" -> -6.1, "E10525" -> 105.4167. Latitude has 2 degree digits, longitude 3. */
export function parseCoordinate(token: string): number | null {
  const m = /^([NSEW])(\d{4,5})(?:\.(\d+))?$/.exec(token.trim());
  if (!m) return null;
  const hemisphere = m[1]!;
  const digits = m[2]!;
  const fraction = m[3];
  const isLatitude = hemisphere === "N" || hemisphere === "S";
  if (isLatitude && digits.length !== 4) return null;
  if (!isLatitude && digits.length !== 5) return null;
  const degrees = Number(digits.slice(0, -2));
  const minutes = Number(`${digits.slice(-2)}${fraction ? `.${fraction}` : ""}`);
  if (minutes >= 60) return null;
  const value = degrees + minutes / 60;
  const signed = hemisphere === "S" || hemisphere === "W" ? -value : value;
  return Math.round(signed * 10_000) / 10_000;
}

/** Parses every "<base>/<top> <coords> [MOV dir speedKT]" group in a cloud field. */
export function parseLayers(text: string): AshLayer[] {
  const starts = [...text.matchAll(LAYER_START_RE)];
  const layers: AshLayer[] = [];
  starts.forEach((m, i) => {
    const segmentEnd = i + 1 < starts.length ? starts[i + 1]!.index : text.length;
    const segment = text.slice(m.index + m[0].length, segmentEnd);
    const polygon: LonLat[] = [];
    for (const c of segment.matchAll(COORD_PAIR_RE)) {
      const lat = parseCoordinate(c[1]!);
      const lon = parseCoordinate(c[2]!);
      if (lat !== null && lon !== null) polygon.push([lon, lat]);
    }
    if (polygon.length < 3) return;
    const mv = MOVEMENT_RE.exec(segment);
    layers.push({
      baseFl: m[1] === "SFC" ? 0 : Number(m[2]),
      topFl: Number(m[3]),
      polygon,
      movement: mv ? { direction: mv[1]!, speedKt: Number(mv[2]) } : null,
    });
  });
  return layers;
}

function splitTimeToken(value: string, reference: Date): { time: Date | null; rest: string } {
  const m = DAYTIME_TOKEN_RE.exec(value);
  if (!m) return { time: null, rest: value };
  return { time: resolveDayTime(m[1]!, reference), rest: value.slice(m[0].length) };
}

export function parseAdvisory(bulletin: string): ParseResult {
  const trimmed = bulletin.trim();
  const header = (trimmed.split(/\r?\n/)[0] ?? "").trim();
  const fields = parseFields(trimmed);
  const issued = parseDtg(fields.get("DTG") ?? "");
  if (!issued) return { ok: false, header, reason: "missing or invalid DTG" };
  const volcano = fields.get("VOLCANO");
  if (!volcano) return { ok: false, header, reason: "missing VOLCANO" };

  let observation: Observation | null = null;
  for (const kind of ["OBS", "EST"] as const) {
    const cloud = fields.get(`${kind} VA CLD`);
    if (cloud === undefined) continue;
    const dtgToken = fields.get(`${kind} VA DTG`);
    const time = dtgToken ? resolveDayTime(dtgToken, issued) : null;
    observation = { kind, time: toIso(time ?? issued), layers: parseLayers(cloud) };
    break;
  }

  const forecasts: Forecast[] = [];
  for (const [key, value] of fields) {
    const fm = FCST_KEY_RE.exec(key);
    if (!fm) continue;
    const hoursAhead = Number(fm[1]);
    const { time, rest } = splitTimeToken(value, issued);
    const fallback = new Date(issued.getTime() + hoursAhead * 3_600_000);
    forecasts.push({ hoursAhead, time: toIso(time ?? fallback), layers: parseLayers(rest) });
  }
  forecasts.sort((a, b) => a.hoursAhead - b.hoursAhead);

  const next = /(\d{8}\/\d{4}Z)/.exec(fields.get("NXT ADVISORY") ?? "");
  const nextDate = next ? parseDtg(next[1]!) : null;

  const psn = PSN_RE.exec(fields.get("PSN") ?? "");
  const lat = psn ? parseCoordinate(psn[1]!) : null;
  const lon = psn ? parseCoordinate(psn[2]!) : null;
  const elev = ELEV_RE.exec(fields.get("SOURCE ELEV") ?? "");

  const candidate: Advisory = {
    header,
    issuedAt: toIso(issued),
    volcano,
    position: lat !== null && lon !== null ? { lat, lon } : null,
    elevationM: elev ? Number(elev[1]) : null,
    advisoryNumber: fields.get("ADVISORY NR") ?? null,
    infoSource: fields.get("INFO SOURCE") ?? null,
    eruptionDetails: fields.get("ERUPTION DETAILS") ?? null,
    remarks: fields.get("RMK") ?? null,
    nextAdvisoryBy: nextDate ? toIso(nextDate) : null,
    observation,
    forecasts,
    raw: trimmed,
  };
  const checked = advisorySchema.safeParse(candidate);
  if (!checked.success) return { ok: false, header, reason: checked.error.message };
  return { ok: true, advisory: checked.data };
}

export function parseAllAdvisories(text: string): { advisories: Advisory[]; failures: ParseFailure[] } {
  const advisories: Advisory[] = [];
  const failures: ParseFailure[] = [];
  for (const bulletin of splitBulletins(text)) {
    const r = parseAdvisory(bulletin);
    if (r.ok) advisories.push(r.advisory);
    else failures.push({ header: r.header, reason: r.reason });
  }
  return { advisories, failures };
}

/** True when the VAAC closed the series: no next advisory is scheduled and the bulletin says so. */
export function isTerminated(advisory: Advisory): boolean {
  return advisory.nextAdvisoryBy === null && /NO FURTHER ADVISORIES/i.test(advisory.raw);
}

/** Newest advisory whose VOLCANO field matches the pattern, or null. */
export function latestAdvisoryFor(advisories: Advisory[], volcano: RegExp): Advisory | null {
  return (
    advisories
      .filter((a) => volcano.test(a.volcano))
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0] ?? null
  );
}
