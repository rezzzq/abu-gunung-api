import "leaflet/dist/leaflet.css";
import "./style.css";
import L from "leaflet";
import { DATA_URL, LINKS, REFRESH_MS, VOLCANO, WIND_REFRESH_MS } from "./config";
import { getLocale, setLocale, t, type Locale } from "./i18n";
import { latestDataSchema, type LatestData } from "./lib/schema";
import { formatWibClock } from "./lib/time";
import { AshLayer, type TimeStep } from "./map/ash-layer";
import { createMap } from "./map/map";
import { SatelliteLayer } from "./map/satellite-layer";
import { fetchWind, renderWindCard, WindLayer, type WindReport } from "./map/wind";
import { initLocationCheck } from "./ui/location-check";
import { initShare } from "./ui/share";
import { initSheet } from "./ui/sheet";
import { layerPopupHtml, renderFreshness, renderLegend, renderStatus, renderStepInfo } from "./ui/status-card";
import { buildSteps, initTimeChips, type TimeChips } from "./ui/time-chips";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const locale: Locale = getLocale();
document.documentElement.lang = locale;
document.title = t(locale, "appTitle");

const els = {
  map: byId<HTMLDivElement>("map"),
  title: byId<HTMLHeadingElement>("title"),
  freshness: byId<HTMLParagraphElement>("freshness"),
  lang: byId<HTMLButtonElement>("lang"),
  banner: byId<HTMLDivElement>("banner"),
  bannerText: byId<HTMLSpanElement>("banner-text"),
  bannerRetry: byId<HTMLButtonElement>("banner-retry"),
  toggleSat: byId<HTMLButtonElement>("toggle-sat"),
  toggleWind: byId<HTMLButtonElement>("toggle-wind"),
  locate: byId<HTMLButtonElement>("locate"),
  legend: byId<HTMLDivElement>("legend"),
  chips: byId<HTMLDivElement>("time-chips"),
  sheet: byId<HTMLElement>("sheet"),
  sheetHandle: byId<HTMLButtonElement>("sheet-handle"),
  status: byId<HTMLDivElement>("status"),
  stepInfo: byId<HTMLDivElement>("step-info"),
  windCard: byId<HTMLElement>("wind-card"),
  checkLocation: byId<HTMLButtonElement>("check-location"),
  locationResult: byId<HTMLParagraphElement>("location-result"),
  safety: byId<HTMLElement>("safety"),
  links: byId<HTMLElement>("links"),
  share: byId<HTMLButtonElement>("share"),
  footer: byId<HTMLElement>("footer"),
};

// Static copy
els.title.textContent = t(locale, "appTitle");
els.lang.textContent = locale === "id" ? "EN" : "ID";
els.lang.setAttribute("aria-label", t(locale, "language"));
els.lang.lang = locale === "id" ? "en" : "id";
els.bannerRetry.textContent = t(locale, "retry");
els.toggleSat.setAttribute("aria-label", t(locale, "satellite"));
els.toggleSat.title = t(locale, "satellite");
els.toggleWind.setAttribute("aria-label", t(locale, "windToggle"));
els.toggleWind.title = t(locale, "windToggle");
els.locate.setAttribute("aria-label", t(locale, "locateToggle"));
els.locate.title = t(locale, "locateToggle");
els.safety.innerHTML = `<h2>${t(locale, "safetyTitle")}</h2><ul class="safety-list">${(["safety1", "safety2", "safety3", "safety4", "safety5"] as const)
  .map((k) => `<li>${t(locale, k)}</li>`)
  .join("")}</ul>`;
els.links.innerHTML = `<h2>${t(locale, "officialLinks")}</h2><ul class="links-list">
  <li><a href="${LINKS.magma}" target="_blank" rel="noopener">${t(locale, "linkMagma")}</a></li>
  <li><a href="${LINKS.bmkg}" target="_blank" rel="noopener">${t(locale, "linkBmkg")}</a></li>
  <li><a href="${LINKS.vaac}" target="_blank" rel="noopener">${t(locale, "linkVaac")}</a></li>
</ul>`;
els.footer.innerHTML = `<a class="footer__brand" href="${LINKS.brand}" target="_blank" rel="noopener"><img src="${import.meta.env.BASE_URL}brand/niriksagara.png" alt="" width="26" height="26"><span>${t(locale, "madeBy")} <b>niriksagara.id</b> · ${t(locale, "madeByTail")}</span></a><span>${t(locale, "dataFrom")}</span>`;

els.lang.addEventListener("click", () => {
  setLocale(locale === "id" ? "en" : "id");
  location.reload();
});

// Map and layers
const map = createMap(els.map, `<strong>${VOLCANO.name}</strong><br>${VOLCANO.elevationM} m`);
const ashLayer = new AshLayer(map, (layer) => layerPopupHtml(layer, locale));
const satellite = new SatelliteLayer(map);
const windLayer = new WindLayer(map, locale);
const sheet = initSheet(els.sheet, els.sheetHandle, locale);
initShare(els.share, locale);

let steps: TimeStep[] = [];
let stepIndex = 0;
let chips: TimeChips | null = null;
let userMarker: L.Marker | null = null;
let latest: LatestData | null = null;

const currentStep = (): TimeStep | null => steps[stepIndex] ?? null;

const locationCheck = initLocationCheck({
  button: els.checkLocation,
  result: els.locationResult,
  locale,
  getStep: currentStep,
  onLocated: (lat, lon) => {
    const icon = L.divIcon({ className: "", html: '<div class="user-marker"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
    if (userMarker) userMarker.setLatLng([lat, lon]);
    else userMarker = L.marker([lat, lon], { icon, zIndexOffset: 900 }).addTo(map);
    map.fitBounds(L.latLngBounds([[lat, lon], [VOLCANO.lat, VOLCANO.lon]]), { padding: [60, 60], maxZoom: 9 });
    sheet.expand();
  },
});

els.locate.addEventListener("click", () => {
  sheet.expand();
  locationCheck.request();
});

function showStep(i: number): void {
  stepIndex = i;
  const step = currentStep();
  ashLayer.show(step);
  renderStepInfo(els.stepInfo, step, locale);
  renderLegend(els.legend, step, locale);
  locationCheck.refresh();
}

function applyData(data: LatestData): void {
  const previousHeader = latest?.vaac?.header;
  latest = data;
  renderStatus(els.status, data, locale);
  renderFreshness(els.freshness, data.generatedAt, new Date(), locale);
  if (data.satellite?.latestFrameTime) {
    els.toggleSat.title = t(locale, "satelliteFrame", { time: formatWibClock(data.satellite.latestFrameTime) });
  }
  // Rebuild the time steps only when the advisory changed, so a poll does not reset the selection.
  if (data.vaac?.header !== previousHeader || !chips) {
    steps = data.vaac ? buildSteps(data.vaac, locale) : [];
    chips?.stop();
    chips = initTimeChips(els.chips, steps, locale, showStep);
    if (!steps.length) showStep(0);
  }
}

/** Safe for untrusted text: the message is set as textContent, never parsed as HTML. */
function showBanner(message: string): void {
  els.bannerText.textContent = message;
  els.banner.hidden = false;
}

async function loadData(): Promise<void> {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = latestDataSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error(parsed.error.message);
    els.banner.hidden = true;
    applyData(parsed.data);
  } catch (e) {
    // Keep whatever is on screen; tell the user and offer a retry.
    const reason = e instanceof Error ? e.message : String(e);
    showBanner(`${t(locale, "loadError")} (${reason})`);
  }
}

els.bannerRetry.addEventListener("click", () => void loadData());

// Wind
let wind: WindReport | null = null;
async function loadWind(): Promise<void> {
  try {
    wind = await fetchWind(new Date());
  } catch (e) {
    // Wind is a secondary layer; the card shows "unavailable" and the map keeps working.
    console.warn(`wind: ${e instanceof Error ? e.message : String(e)}`);
    wind = null;
  }
  renderWindCard(els.windCard, wind, locale);
  windLayer.show(wind);
}

els.toggleSat.addEventListener("click", () => {
  satellite.setVisible(!satellite.isVisible());
  els.toggleSat.setAttribute("aria-pressed", String(satellite.isVisible()));
});
els.toggleWind.addEventListener("click", () => {
  windLayer.setVisible(!windLayer.isVisible());
  els.toggleWind.setAttribute("aria-pressed", String(windLayer.isVisible()));
});

// Boot
void loadData();
void loadWind();
window.setInterval(() => void loadData(), REFRESH_MS);
window.setInterval(() => void loadWind(), WIND_REFRESH_MS);
window.setInterval(() => {
  if (latest) renderFreshness(els.freshness, latest.generatedAt, new Date(), locale);
  satellite.refresh();
}, 60_000);
