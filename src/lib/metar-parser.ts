import { toIso } from "./time";

export interface MetarReport {
  icao: string;
  /** Observation time as ISO UTC; the METAR carries only day, hour and minute. */
  time: string;
  /** Prevailing visibility in metres, capped at 10000 (9999 and CAVOK mean 10 km or more). */
  visibilityM: number | null;
  /** Present-weather codes such as VA (volcanic ash), HZ (haze), FU (smoke). */
  weather: string[];
  /** True when volcanic ash is reported at, blowing over, or in the vicinity of the airport. */
  ash: boolean;
}

const HEADER_RE = /^(?:METAR|SPECI)\s+(?:COR\s+)?([A-Z]{4})\s+(\d{2})(\d{2})(\d{2})Z/;
const WEATHER_RE = /^[+-]?(?:VC)?(?:MI|BC|PR|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/;

/** Resolves a day-of-month observation time against the reference date, allowing for the month boundary. */
function resolveTime(day: number, hour: number, minute: number, reference: Date): Date {
  const candidate = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), day, hour, minute));
  if (candidate.getTime() - reference.getTime() > 12 * 3_600_000) candidate.setUTCMonth(candidate.getUTCMonth() - 1);
  return candidate;
}

/** Parses one METAR line; null when the text is not a METAR. Remarks after RMK are ignored. */
export function parseMetar(raw: string, reference: Date): MetarReport | null {
  const text = raw.trim().replace(/\s+/g, " ");
  const head = HEADER_RE.exec(text);
  if (!head) return null;
  const body = text.split(" RMK ")[0] ?? text;
  const tokens = body.split(" ").slice(3);
  let visibilityM: number | null = null;
  const weather: string[] = [];
  for (const token of tokens) {
    if (token === "CAVOK") visibilityM = 10000;
    else if (visibilityM === null && /^\d{4}(?:NDV)?$/.test(token)) {
      const metres = Number(token.slice(0, 4));
      visibilityM = metres >= 9999 ? 10000 : metres;
    }
    else if (WEATHER_RE.test(token)) weather.push(token);
  }
  return {
    icao: head[1]!,
    time: toIso(resolveTime(Number(head[2]), Number(head[3]), Number(head[4]), reference)),
    visibilityM,
    weather,
    ash: weather.some((w) => w.includes("VA")),
  };
}
