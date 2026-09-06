import L from "leaflet";
import { COLORS, OPEN_METEO_URL, VOLCANO } from "../config";
import { bearingToCompass, compassName, t, type Locale } from "../i18n";
import { formatWibClock } from "../lib/time";
import { destinationPoint, pickWindReport, towardDeg, type WindLevelKey, type WindReport } from "../lib/wind-report";

export type { WindReport } from "../lib/wind-report";

export async function fetchWind(now: Date, signal?: AbortSignal): Promise<WindReport | null> {
  const res = await fetch(OPEN_METEO_URL, { signal });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return pickWindReport(await res.json(), now);
}

const LEVEL_LABEL: Record<WindLevelKey, "windSurface" | "windLow" | "windMid" | "windHigh"> = {
  surface: "windSurface",
  low: "windLow",
  mid: "windMid",
  high: "windHigh",
};

export function renderWindCard(el: HTMLElement, report: WindReport | null, locale: Locale): void {
  const title = `<h2>${t(locale, "wind")}</h2>`;
  if (!report) {
    el.innerHTML = `${title}<p class="hint">${t(locale, "windUnavailable")}</p>`;
    return;
  }
  const rows = report.levels
    .map((level) => {
      const toward = towardDeg(level);
      const color = COLORS.wind[level.key];
      return `<div class="wind-row">
        <span class="wind-row__level">${t(locale, LEVEL_LABEL[level.key])}</span>
        <span class="wind-row__arrow" aria-hidden="true"><svg viewBox="0 0 24 24" style="transform:rotate(${toward}deg)"><path d="M12 3 L18 13 L13.5 11.5 L13.5 21 L10.5 21 L10.5 11.5 L6 13 Z" fill="${color}"/></svg></span>
        <span class="wind-row__text"><span class="wind-row__speed">${Math.round(level.speedKmh)} km/j</span><span class="wind-row__dir">${t(locale, "ashTowards", { dir: compassName(locale, bearingToCompass(toward)) })}</span></span>
      </div>`;
    })
    .join("");
  el.innerHTML = `${title}<p class="hint">${t(locale, "windHint")}</p><div class="wind-rows">${rows}</div><p class="hint">${t(locale, "windAt", { time: formatWibClock(report.time) })}</p>`;
}

/** Draws one arrow per wind level from the crater in the direction ash would travel. */
export class WindLayer {
  private readonly group = L.layerGroup();
  private visible = false;

  constructor(private readonly map: L.Map, private readonly locale: Locale) {}

  show(report: WindReport | null): void {
    this.group.clearLayers();
    if (!report) return;
    for (const level of report.levels) {
      const toward = towardDeg(level);
      const lengthKm = Math.min(120, Math.max(15, level.speedKmh * 1.2));
      const tip = destinationPoint(VOLCANO.lat, VOLCANO.lon, toward, lengthKm);
      const headL = destinationPoint(tip[0], tip[1], toward + 150, lengthKm * 0.18);
      const headR = destinationPoint(tip[0], tip[1], toward - 150, lengthKm * 0.18);
      const color = COLORS.wind[level.key];
      const style: L.PolylineOptions = { color, weight: level.key === "surface" ? 3 : 4, opacity: 0.9, lineCap: "round", pane: "wind" };
      L.polyline([[VOLCANO.lat, VOLCANO.lon], tip], style).addTo(this.group);
      L.polyline([headL, tip, headR], style)
        .bindTooltip(`${t(this.locale, LEVEL_LABEL[level.key])} · ${Math.round(level.speedKmh)} km/j`, { className: "wind-tip", direction: "top" })
        .addTo(this.group);
    }
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    if (v) this.group.addTo(this.map);
    else this.group.remove();
  }

  isVisible(): boolean {
    return this.visible;
  }
}
