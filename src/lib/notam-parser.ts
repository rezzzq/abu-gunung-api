import { z } from "zod";
import { toIso } from "./time";

/** One NOTAM as the site keeps it: the parts a reader needs, not the whole message. */
export interface NotamSummary {
  number: string;
  start: string | null;
  /** Null when the NOTAM is permanent or has no end. */
  end: string | null;
  /** True when the NOTAM closes the whole aerodrome (Q code QFALC or matching text). */
  closure: boolean;
  /** True when the NOTAM mentions volcanic ash. */
  ash: boolean;
  text: string;
}

export interface NotamStatus {
  /** A closure NOTAM is in force at the time of the fetch. */
  closed: boolean;
  closedUntil: string | null;
  ashNotam: boolean;
  /** NOTAMs still relevant now or later, newest closure first. */
  notams: NotamSummary[];
}

/** The parts of an FAA NOTAM API item we rely on; everything else is ignored. */
const itemSchema = z.object({
  properties: z.object({
    coreNOTAMData: z.object({
      notam: z.object({
        number: z.string().min(1),
        effectiveStart: z.string().optional(),
        effectiveEnd: z.string().optional(),
        text: z.string().default(""),
        selectionCode: z.string().optional(),
      }),
    }),
  }),
});

const CLOSURE_RE = /\b(?:AD|AERODROME|AIRPORT|APT)\s+(?:CLSD|CLOSED)\b/i;
const ASH_RE = /VOLCANIC ASH|\bVA\b|\bASH\b/i;
const MAX_TEXT = 240;

function parseTime(value: string | undefined): string | null {
  if (!value || /PERM/i.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : toIso(new Date(ms));
}

/** Condenses raw API items into closure and ash facts for one airport. Unreadable items are skipped. */
export function summarizeNotams(items: unknown[], now: Date): NotamStatus {
  const notams: NotamSummary[] = [];
  for (const raw of items) {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const n = parsed.data.properties.coreNOTAMData.notam;
    const end = parseTime(n.effectiveEnd);
    if (end && Date.parse(end) < now.getTime()) continue;
    const text = n.text.replace(/\s+/g, " ").trim();
    notams.push({
      number: n.number,
      start: parseTime(n.effectiveStart),
      end,
      closure: n.selectionCode === "QFALC" || CLOSURE_RE.test(text),
      ash: ASH_RE.test(text),
      text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text,
    });
  }
  notams.sort((a, b) => Number(b.closure) - Number(a.closure) || (a.start ?? "").localeCompare(b.start ?? ""));
  const active = notams.filter((n) => n.closure && (!n.start || Date.parse(n.start) <= now.getTime()));
  const closedUntil = active.every((n) => n.end) ? active.map((n) => n.end!).sort().pop() ?? null : null;
  return {
    closed: active.length > 0,
    closedUntil: active.length ? closedUntil : null,
    ashNotam: notams.some((n) => n.ash),
    notams,
  };
}
