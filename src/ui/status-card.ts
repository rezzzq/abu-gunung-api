import { STALE_BAD_MIN, STALE_WARN_MIN } from "../config";
import { compassName, levelLabel, t, vonaColorLabel, type Locale } from "../i18n";
import { formatAltitude } from "../lib/flight-level";
import type { AshLayer, LatestData } from "../lib/schema";
import { formatRelative, formatWib, minutesBetween } from "../lib/time";
import { isHighLayer, type TimeStep } from "../map/ash-layer";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function renderFreshness(el: HTMLElement, generatedAt: string, now: Date, locale: Locale): void {
  const mins = minutesBetween(generatedAt, now);
  el.textContent = t(locale, "updated", { rel: formatRelative(generatedAt, now, locale) });
  el.classList.toggle("bad", mins >= STALE_BAD_MIN);
  el.classList.toggle("warn", mins >= STALE_WARN_MIN && mins < STALE_BAD_MIN);
  el.title = formatWib(generatedAt, locale);
}

/** Headline for the collapsed sheet: "Abu hingga 15,2 km, bergerak ke barat". */
function headlineFor(layers: AshLayer[], locale: Locale): string {
  if (!layers.length) return "";
  const top = layers.reduce((a, b) => (b.topFl > a.topFl ? b : a));
  const parts = [t(locale, "ashTop", { alt: formatAltitude(top.topFl, locale) })];
  if (top.movement) parts.push(t(locale, "ashTowards", { dir: compassName(locale, top.movement.direction) }));
  return parts.join(", ");
}

export function renderStatus(el: HTMLElement, data: LatestData, locale: Locale): void {
  const badges: string[] = [];
  const level = data.magma?.activityLevel;
  if (level) {
    badges.push(`<span class="badge badge--level${level.level}">${escapeHtml(levelLabel(locale, level.level, level.name))}</span>`);
  }
  const vona = data.magma?.latestVona;
  if (vona) {
    const color = vona.colorCode.toLowerCase();
    const known = ["red", "orange", "yellow", "green"].includes(color) ? color : "unknown";
    badges.push(
      `<span class="badge badge--vona" title="${escapeHtml(vona.title)}"><span class="badge__dot badge__dot--${known}"></span>VONA ${escapeHtml(vonaColorLabel(locale, vona.colorCode))}</span>`,
    );
  }

  const adv = data.vaac;
  const lines: string[] = [];
  if (badges.length) lines.push(`<div class="status__row">${badges.join("")}</div>`);
  if (adv?.observation) {
    const headline = headlineFor(adv.observation.layers, locale);
    if (headline) lines.push(`<p class="status__headline">${escapeHtml(headline)}</p>`);
    const meta: string[] = [];
    if (adv.advisoryNumber) meta.push(t(locale, "advisoryNo", { n: adv.advisoryNumber }));
    meta.push(t(locale, "issued", { time: formatWib(adv.issuedAt, locale) }));
    lines.push(`<p class="status__meta">${escapeHtml(meta.join(" · "))}</p>`);
    if (adv.nextAdvisoryBy) {
      lines.push(`<p class="status__meta">${escapeHtml(t(locale, "nextAdvisory", { time: formatWib(adv.nextAdvisoryBy, locale) }))}</p>`);
    }
  } else if (!adv) {
    lines.push(`<p class="status__empty">${t(locale, "noAdvisory")}</p><p class="status__meta">${t(locale, "noAdvisoryHint")}</p>`);
  }
  if (vona?.text) {
    const stamp = `VONA ${formatWib(vona.time, locale)}`;
    lines.push(
      `<p class="vona-text clamped" id="vona-text"><b>${escapeHtml(stamp)}:</b> ${escapeHtml(vona.text)}</p><button type="button" class="linklike" id="vona-more">${t(locale, "readMore")}</button>`,
    );
  }
  if (data.sourceErrors.length) lines.push(`<p class="status__warn">${t(locale, "sourceWarn")}</p>`);
  el.innerHTML = lines.join("");

  const more = el.querySelector<HTMLButtonElement>("#vona-more");
  const text = el.querySelector<HTMLElement>("#vona-text");
  if (more && text) {
    more.addEventListener("click", () => {
      const clamped = text.classList.toggle("clamped");
      more.textContent = t(locale, clamped ? "readMore" : "readLess");
    });
  }
}

function layerLabel(layer: AshLayer, locale: Locale): string {
  const base = layer.baseFl === 0 ? t(locale, "surface") : formatAltitude(layer.baseFl, locale);
  return `${t(locale, isHighLayer(layer) ? "layerHigh" : "layerLow")}: ${t(locale, "layerRange", { base, top: formatAltitude(layer.topFl, locale) })}`;
}

/** Details for the selected step: time and one row per layer. */
export function renderStepInfo(el: HTMLElement, step: TimeStep | null, locale: Locale): void {
  if (!step) {
    el.innerHTML = "";
    return;
  }
  const rows = step.layers.map((layer) => {
    const swatch = isHighLayer(layer) ? "legend__swatch--high" : "legend__swatch--low";
    const move = layer.movement
      ? t(locale, "moving", { dir: compassName(locale, layer.movement.direction), speed: Math.round(layer.movement.speedKt * 1.852) })
      : t(locale, "notMoving");
    return `<p class="step-info__layer"><span class="legend__swatch ${swatch}"></span><span>${escapeHtml(layerLabel(layer, locale))}<br><span class="step-info__meta">${escapeHtml(move)}</span></span></p>`;
  });
  const empty = step.layers.length ? "" : `<p class="step-info__empty">${t(locale, "noAdvisory")}</p>`;
  el.innerHTML = `<p class="step-info__title">${escapeHtml(step.description)}</p>${rows.join("")}${empty}`;
}

export function renderLegend(el: HTMLElement, step: TimeStep | null, locale: Locale): void {
  const rows: string[] = [];
  const low = step?.layers.filter((l) => !isHighLayer(l)) ?? [];
  const high = step?.layers.filter(isHighLayer) ?? [];
  const topOf = (layers: AshLayer[]): string => formatAltitude(Math.max(...layers.map((l) => l.topFl)), locale);
  if (low.length) rows.push(`<div class="legend__row"><span class="legend__swatch legend__swatch--low"></span><span>${t(locale, "layerLow")} <span class="legend__alt">≤ ${escapeHtml(topOf(low))}</span></span></div>`);
  if (high.length) rows.push(`<div class="legend__row"><span class="legend__swatch legend__swatch--high"></span><span>${t(locale, "layerHigh")} <span class="legend__alt">≤ ${escapeHtml(topOf(high))}</span></span></div>`);
  rows.push(`<div class="legend__row"><span class="legend__swatch legend__swatch--volcano"></span><span>${t(locale, "legendVolcano")}</span></div>`);
  el.innerHTML = rows.join("");
}

/** Popup for a tapped polygon. */
export function layerPopupHtml(layer: AshLayer, locale: Locale): string {
  const move = layer.movement
    ? t(locale, "moving", { dir: compassName(locale, layer.movement.direction), speed: Math.round(layer.movement.speedKt * 1.852) })
    : t(locale, "notMoving");
  return `<strong>${escapeHtml(layerLabel(layer, locale))}</strong><br>${escapeHtml(move)}`;
}

export { escapeHtml };
