export type Locale = "id" | "en";

const DTG_RE = /^(\d{4})(\d{2})(\d{2})\/(\d{2})(\d{2})Z?$/;
const DAYTIME_RE = /^(\d{2})\/(\d{2})(\d{2})Z?$/;
const WIB = "Asia/Jakarta";

/** Parses a VAAC date-time group such as "20260906/0030Z" into a UTC Date. */
export function parseDtg(value: string): Date | null {
  const m = DTG_RE.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1, 6).map(Number);
  const t = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  // Reject overflowed dates such as 20260231.
  return d.getUTCMonth() === month! - 1 && d.getUTCDate() === day ? d : null;
}

/**
 * Resolves a day/time token such as "06/0010Z" against a reference instant.
 * The token carries no month, so the previous, same and next months are tried
 * and the candidate closest to the reference wins. This handles observations
 * from the previous month and forecasts that cross into the next month.
 */
export function resolveDayTime(token: string, reference: Date): Date | null {
  const m = DAYTIME_RE.exec(token.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  let best: Date | null = null;
  for (const delta of [-1, 0, 1]) {
    const candidate = new Date(Date.UTC(year, month + delta, day, hour, minute));
    // Date.UTC rolls a nonexistent day (e.g. 31 in a 30-day month) into the next month; skip those.
    if (candidate.getUTCDate() !== day) continue;
    const dist = Math.abs(candidate.getTime() - reference.getTime());
    if (!best || dist < Math.abs(best.getTime() - reference.getTime())) best = candidate;
  }
  return best;
}

/** ISO 8601 in UTC without milliseconds, e.g. 2026-09-06T00:30:00Z. */
export function toIso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function formatWibClock(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatWib(iso: string, locale: Locale): string {
  const date = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    timeZone: WIB,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
  return `${date}, ${formatWibClock(iso)} WIB`;
}

export function minutesBetween(fromIso: string, now: Date): number {
  return Math.round((now.getTime() - new Date(fromIso).getTime()) / 60_000);
}

export function formatRelative(iso: string, now: Date, locale: Locale): string {
  const mins = Math.max(0, minutesBetween(iso, now));
  const id = locale === "id";
  if (mins < 60) return id ? `${mins} mnt lalu` : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return id ? `${hours} j lalu` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return id ? `${days} hr lalu` : `${days} d ago`;
}
