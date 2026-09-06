import { activityLevelSchema, vonaSchema, type ActivityLevel, type VonaEntry } from "./schema";

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };
const LEVEL_RE = /Level (I|II|III|IV)\s*\(([^)]+)\)/g;
const VONA_TIME_RE = /<small>(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC<\/small>/;
const VONA_COLOR_RE = /btn-(?:danger|warning|success|secondary|info|light|dark|primary)">([A-Za-z]+)<\/a>/;
const VONA_TITLE_RE = /timeline-title"><a[^>]*>([^<]+)<\/a>/;
const VONA_TEXT_RE = /timeline-text">([\s\S]*?)<\/p>/;
const VONA_URL_RE = /card-link[^"]*"\s+href="([^"]+)"/;

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/**
 * Reads the PVMBG activity level for one volcano from the MAGMA
 * "tingkat aktivitas" page. The table groups volcanoes under a level cell
 * (rowspan), so the level that applies is the last "Level N (name)" text that
 * appears before the volcano's row. The page also carries a legend listing all
 * four levels before the table; taking the last match before the row makes the
 * legend harmless.
 */
export function parseActivityLevel(html: string, volcanoName = "Anak Krakatau"): ActivityLevel | null {
  const rowIndex = html.indexOf(`${volcanoName} - `);
  if (rowIndex < 0) return null;
  let found: ActivityLevel | null = null;
  for (const m of html.matchAll(LEVEL_RE)) {
    if (m.index > rowIndex) break;
    const level = ROMAN[m[1]!];
    if (level === undefined) continue;
    const parsed = activityLevelSchema.safeParse({ level, name: m[2]!.trim() });
    if (parsed.success) found = parsed.data;
  }
  return found;
}

/** A table row reads "<td> Name - Province <a href=...>Lihat laporan</a>". */
const ROW_RE = /<td>\s*([^<\n]+?)\s+-\s+[^<\n]+?\s*<a\s/g;

/** Every volcano on the MAGMA level page with its PVMBG level, keyed by MAGMA name. */
export function parseActivityLevels(html: string): Map<string, ActivityLevel> {
  const levels = new Map<string, ActivityLevel>();
  const marks: { index: number; level: ActivityLevel }[] = [];
  for (const m of html.matchAll(LEVEL_RE)) {
    const level = ROMAN[m[1]!];
    if (level === undefined) continue;
    const parsed = activityLevelSchema.safeParse({ level, name: m[2]!.trim() });
    if (parsed.success) marks.push({ index: m.index, level: parsed.data });
  }
  for (const row of html.matchAll(ROW_RE)) {
    const name = decodeEntities(row[1]!.trim());
    const before = marks.filter((mk) => mk.index < row.index);
    const current = before[before.length - 1];
    if (current && !levels.has(name)) levels.set(name, current.level);
  }
  return levels;
}

export type VonaWithVolcano = VonaEntry & { volcano: string };

/** Every VONA on a MAGMA timeline page (newest first) with the volcano named in its title. */
export function parseVonas(html: string): VonaWithVolcano[] {
  const out: VonaWithVolcano[] = [];
  for (const entry of parseAllVonas(html)) {
    const volcano = /^(.*?)\s+-\s+\d{8}\/\d{4}Z/.exec(entry.title)?.[1]?.trim();
    if (volcano) out.push({ ...entry, volcano });
  }
  return out;
}

/** Newest VONA for one MAGMA volcano name, or null. */
export function latestVonaFor(entries: VonaWithVolcano[], magmaName: string): VonaEntry | null {
  const own = entries.filter((e) => e.volcano === magmaName).sort((a, b) => b.time.localeCompare(a.time));
  if (!own[0]) return null;
  const { volcano: _v, ...entry } = own[0];
  return entry;
}

/** Newest VONA entry on a MAGMA VONA timeline page, or null when none parses. */
export function parseLatestVona(html: string): VonaEntry | null {
  return parseAllVonas(html)[0] ?? null;
}

function parseAllVonas(html: string): VonaEntry[] {
  const entries: VonaEntry[] = [];
  const blocks = html.split(/class="timeline-item/).slice(1);
  for (const block of blocks) {
    const time = VONA_TIME_RE.exec(block);
    if (!time) continue;
    const color = VONA_COLOR_RE.exec(block);
    const title = VONA_TITLE_RE.exec(block);
    const text = VONA_TEXT_RE.exec(block);
    const url = VONA_URL_RE.exec(block);
    const candidate = {
      time: `${time[1]}T${time[2]}Z`,
      colorCode: color?.[1] ?? "Unknown",
      title: decodeEntities(title?.[1]?.trim() ?? ""),
      text: decodeEntities(
        text?.[1]?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() ?? "",
      ),
      url: url ? decodeEntities(url[1]!) : null,
    };
    const parsed = vonaSchema.safeParse(candidate);
    if (parsed.success) entries.push(parsed.data);
  }
  return entries;
}
