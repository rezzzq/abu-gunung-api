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

/** Newest VONA entry on a MAGMA VONA timeline page, or null when none parses. */
export function parseLatestVona(html: string): VonaEntry | null {
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
    if (parsed.success) return parsed.data;
  }
  return null;
}
