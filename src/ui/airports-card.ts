import { t, type Locale } from "../i18n";
import { distanceKm } from "../lib/geo";
import type { AirportStatus } from "../lib/schema";
import { formatWibClock } from "../lib/time";
import { escapeHtml } from "./status-card";

const MAX_AIRPORTS = 4;
const MAX_DISTANCE_KM = 700;

/** The airports nearest to a point, closest first. */
export function nearestAirports(airports: AirportStatus[], lat: number, lon: number): { airport: AirportStatus; km: number }[] {
  return airports
    .map((airport) => ({ airport, km: distanceKm(lon, lat, airport.lon, airport.lat) }))
    .filter((a) => a.km <= MAX_DISTANCE_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_AIRPORTS);
}

/** Card with the nearest airports and their latest METAR: ash reported, visibility, time. */
export function renderAirportsCard(el: HTMLElement, airports: AirportStatus[], volcano: { lat: number; lon: number } | null, locale: Locale): void {
  const rows = volcano ? nearestAirports(airports, volcano.lat, volcano.lon) : [];
  el.hidden = rows.length === 0;
  if (!rows.length) {
    el.innerHTML = "";
    return;
  }
  const anyNotam = rows.some(({ airport }) => airport.notam !== null);
  const items = rows.map(({ airport, km }) => {
    const closed = airport.notam?.closed ?? false;
    const state = closed ? "closed" : airport.observedAt === null ? "none" : airport.ash ? "ash" : "clear";
    const label = closed
      ? airport.notam?.closedUntil
        ? t(locale, "airportClosedUntil", { time: formatWibClock(airport.notam.closedUntil) })
        : t(locale, "airportClosed")
      : t(locale, state === "ash" ? "airportAsh" : state === "clear" ? "airportClear" : "airportNoReport");
    const details: string[] = [];
    if (airport.notam && !closed) details.push(t(locale, airport.notam.ashNotam ? "airportAshNotam" : "airportOpen"));
    if (airport.visibilityM !== null) {
      const kmText = airport.visibilityM >= 10000 ? "≥ 10" : (airport.visibilityM / 1000).toFixed(airport.visibilityM % 1000 ? 1 : 0).replace(".", locale === "id" ? "," : ".");
      details.push(t(locale, "airportVisibility", { km: kmText }));
    }
    if (airport.observedAt) details.push(t(locale, "airportAt", { time: formatWibClock(airport.observedAt) }));
    return `<li class="airport airport--${state}" title="${escapeHtml(airport.raw ?? "")}">
      <span class="airport__code">${escapeHtml(airport.iata)}</span>
      <span class="airport__body"><span class="airport__name">${escapeHtml(airport.name)} · ${escapeHtml(airport.city)}</span><span class="airport__meta">${escapeHtml(t(locale, "airportDistance", { km: Math.round(km) }))}${details.length ? ` · ${escapeHtml(details.join(" · "))}` : ""}</span></span>
      <span class="airport__state">${escapeHtml(label)}</span>
    </li>`;
  });
  el.innerHTML = `<h2>${t(locale, "airports")}</h2><ul class="airports">${items.join("")}</ul><p class="hint">${t(locale, anyNotam ? "airportsHintNotam" : "airportsHint")}</p>`;
}
