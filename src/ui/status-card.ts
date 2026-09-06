import { RGB_STALE_MIN, STALE_BAD_MIN, STALE_WARN_MIN } from "../config";
import { compassName, levelLabel, t, vonaColorLabel, type Locale } from "../i18n";
import { formatAltitude, formatKm } from "../lib/flight-level";
import type { AshLayer, Himawari, VolcanoStatus } from "../lib/schema";
import { formatRelative, formatWib, formatWibClock, minutesBetween } from "../lib/time";
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
  const parts = [t(locale, "ashTop", { alt: formatKm(top.topFl, locale) })];
  if (top.movement) parts.push(t(locale, "ashTowards", { dir: compassName(locale, top.movement.direction) }));
  return parts.join(", ");
}

/**
 * The peek shows one line: the PVMBG level as a small pill, the volcano name and the ash headline.
 * Everything else about the advisory and the VONA goes to the detail card in the sheet body.
 */
export function renderStatus(
  peek: HTMLElement,
  detail: HTMLElement,
  volcano: VolcanoStatus | null,
  sourceErrors: string[],
  locale: Locale,
): void {
  if (!volcano) {
    peek.innerHTML = `<p class="status__empty">${t(locale, "noVolcanoes")}</p>`;
    detail.innerHTML = `<h2>${t(locale, "statusTitle")}</h2><p class="status__meta">${t(locale, "noAdvisoryHint")}</p>`;
    return;
  }
  const level = volcano.activityLevel;
  const pill = level ? `<span class="level level--${level.level}">${escapeHtml(level.name)}</span>` : "";
  const adv = volcano.active ? volcano.vaac : null;
  const headline = adv?.observation ? headlineFor(adv.observation.layers, locale) : "";
  const name = escapeHtml(volcano.name);
  if (headline) {
    peek.innerHTML = `<p class="status__headline">${pill}${name}: ${escapeHtml(headline)}</p>`;
  } else {
    peek.innerHTML = `<p class="status__headline">${pill}${name}</p><p class="status__empty">${escapeHtml(t(locale, "noAdvisory", { name: volcano.name }))}</p>`;
  }

  const lines: string[] = [];
  const badges: string[] = [];
  if (level) {
    badges.push(`<span class="badge badge--level${level.level}">${escapeHtml(levelLabel(locale, level.level, level.name))}</span>`);
  }
  const vona = volcano.latestVona;
  if (vona) {
    const color = vona.colorCode.toLowerCase();
    const known = ["red", "orange", "yellow", "green"].includes(color) ? color : "unknown";
    badges.push(
      `<span class="badge badge--vona" title="${escapeHtml(vona.title)}"><span class="badge__dot badge__dot--${known}"></span>VONA ${escapeHtml(vonaColorLabel(locale, vona.colorCode))}</span>`,
    );
  }
  if (badges.length) lines.push(`<div class="status__row">${badges.join("")}</div>`);
  const last = volcano.vaac;
  if (last) {
    const meta: string[] = [];
    if (last.advisoryNumber) meta.push(t(locale, "advisoryNo", { n: last.advisoryNumber }));
    meta.push(t(locale, "issued", { time: formatWib(last.issuedAt, locale) }));
    lines.push(`<p class="status__meta">${escapeHtml(meta.join(" · "))}</p>`);
    if (!volcano.active) lines.push(`<p class="status__meta">${t(locale, "advisoryEnded")}</p>`);
    else if (last.nextAdvisoryBy) {
      lines.push(`<p class="status__meta">${escapeHtml(t(locale, "nextAdvisory", { time: formatWib(last.nextAdvisoryBy, locale) }))}</p>`);
    }
  } else {
    lines.push(`<p class="status__meta">${t(locale, "noAdvisoryHint")}</p>`);
  }
  if (vona?.text) {
    const stamp = `VONA ${formatWib(vona.time, locale)}`;
    lines.push(
      `<p class="vona-text clamped" id="vona-text"><b>${escapeHtml(stamp)}:</b> ${escapeHtml(vona.text)}</p><button type="button" class="linklike" id="vona-more">${t(locale, "readMore")}</button>`,
    );
  }
  if (sourceErrors.length) lines.push(`<p class="status__warn">${t(locale, "sourceWarn")}</p>`);
  detail.innerHTML = `<h2>${t(locale, "statusTitle")}</h2>${lines.join("")}`;

  const more = detail.querySelector<HTMLButtonElement>("#vona-more");
  const text = detail.querySelector<HTMLElement>("#vona-text");
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

/** `compact` gives the one-line version for the sheet peek: kilometres only and no volcano row. */
export function renderLegend(el: HTMLElement, step: TimeStep | null, locale: Locale, compact = false, volcanoName?: string): void {
  const rows: string[] = [];
  const low = step?.layers.filter((l) => !isHighLayer(l)) ?? [];
  const high = step?.layers.filter(isHighLayer) ?? [];
  const format = compact ? formatKm : formatAltitude;
  const topOf = (layers: AshLayer[]): string => format(Math.max(...layers.map((l) => l.topFl)), locale);
  if (low.length) rows.push(`<div class="legend__row"><span class="legend__swatch legend__swatch--low"></span><span>${t(locale, "layerLow")} <span class="legend__alt">≤ ${escapeHtml(topOf(low))}</span></span></div>`);
  if (high.length) rows.push(`<div class="legend__row"><span class="legend__swatch legend__swatch--high"></span><span>${t(locale, "layerHigh")} <span class="legend__alt">≤ ${escapeHtml(topOf(high))}</span></span></div>`);
  if (!compact) rows.push(`<div class="legend__row"><span class="legend__swatch legend__swatch--volcano"></span><span>${escapeHtml(volcanoName ?? t(locale, "legendVolcano"))}</span></div>`);
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

/** Colour key for the Ash RGB or the ash signal view, with the scan time; empty when neither is on. */
export function renderSatLegend(el: HTMLElement, meta: Himawari | null, mode: "truecolor" | "rgb" | "signal" | null, now: Date, locale: Locale): void {
  if (!mode || !meta?.scanTime) {
    el.innerHTML = "";
    return;
  }
  const stale = minutesBetween(meta.scanTime, now) > RGB_STALE_MIN;
  const time = t(locale, "rgbTime", { time: formatWibClock(meta.scanTime) });
  const timeRow = `<div class="legend__row"><span class="legend__alt${stale ? " legend__alt--stale" : ""}" title="${escapeHtml(formatWib(meta.scanTime, locale))}">${escapeHtml(time)}${stale ? ` · ${t(locale, "rgbStale")}` : ""}</span></div>`;
  const rows =
    mode === "truecolor"
      ? [`<div class="legend__row"><span class="legend__note">${t(locale, "trueLegend")}</span></div>`, timeRow]
      : mode === "rgb"
      ? [
          `<div class="legend__row"><span class="legend__swatch legend__swatch--rgb-ash"></span><span>${t(locale, "rgbAsh")}</span></div>`,
          `<div class="legend__row"><span class="legend__swatch legend__swatch--rgb-ice"></span><span>${t(locale, "rgbIce")}</span></div>`,
          `<div class="legend__row"><span class="legend__swatch legend__swatch--rgb-low"></span><span>${t(locale, "rgbLow")}</span></div>`,
          timeRow,
        ]
      : [
          `<div class="legend__row"><span class="legend__ramp" aria-hidden="true"></span><span>${t(locale, "signalLegend")} <span class="legend__alt">${t(locale, "signalWeak")} → ${t(locale, "signalStrong")}</span></span></div>`,
          `<div class="legend__row"><span class="legend__note">${t(locale, "signalCaveat")}</span></div>`,
          timeRow,
        ];
  el.innerHTML = rows.join("");
}
