import "leaflet/dist/leaflet.css";
import "./style.css";
import L from "leaflet";
import { DATA_URL, FOCUS_MAX_ZOOM, HIMAWARI_URL, LINKS, REFRESH_MS, WIND_REFRESH_MS } from "./config";
import { getLocale, setLocale, t, type Locale } from "./i18n";
import { himawariSchema, latestDataSchema, type LatestData, type VolcanoStatus } from "./lib/schema";
import { formatClock, type Zone } from "./lib/time";
import { AshLayer, isHighLayer, type TimeStep } from "./map/ash-layer";
import { Basemap } from "./map/basemap";
import { createMap } from "./map/map";
import { MODES, SatelliteLayer, type SatelliteMode } from "./map/satellite-layer";
import { VolcanoMarkers } from "./map/volcano-markers";
import { fetchWind, renderWindCard, WindLayer, type WindReport } from "./map/wind";
import { initLocationCheck } from "./ui/location-check";
import { initShare } from "./ui/share";
import { initSheet } from "./ui/sheet";
import { escapeHtml, layerPopupHtml, renderFreshness, renderLegend, renderSatLegend, renderStatus, renderStepInfo } from "./ui/status-card";
import { initTheme } from "./ui/theme";
import { buildSteps, initTimeChips, type TimeChips } from "./ui/time-chips";
import { initVolcanoStrip } from "./ui/volcano-strip";
import { renderAirportsCard } from "./ui/airports-card";

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
  satTag: byId<HTMLSpanElement>("sat-tag"),
  satMenu: byId<HTMLDivElement>("sat-menu"),
  legendSat: byId<HTMLDivElement>("legend-sat"),
  peekSat: byId<HTMLDivElement>("peek-sat"),
  toggleWind: byId<HTMLButtonElement>("toggle-wind"),
  toggleTheme: byId<HTMLButtonElement>("toggle-theme"),
  locate: byId<HTMLButtonElement>("locate"),
  legend: byId<HTMLDivElement>("legend"),
  peekLegend: byId<HTMLDivElement>("peek-legend"),
  chips: byId<HTMLDivElement>("time-chips"),
  volcanoStrip: byId<HTMLDivElement>("volcano-strip"),
  sheet: byId<HTMLElement>("sheet"),
  sheetHandle: byId<HTMLButtonElement>("sheet-handle"),
  status: byId<HTMLDivElement>("status"),
  statusDetail: byId<HTMLElement>("status-detail"),
  stepInfo: byId<HTMLDivElement>("step-info"),
  windCard: byId<HTMLElement>("wind-card"),
  airportsCard: byId<HTMLElement>("airports-card"),
  checkLocation: byId<HTMLButtonElement>("check-location"),
  locationResult: byId<HTMLParagraphElement>("location-result"),
  safety: byId<HTMLElement>("safety"),
  links: byId<HTMLElement>("links"),
  share: byId<HTMLButtonElement>("share"),
  footer: byId<HTMLElement>("footer"),
};

// Static copy
els.title.textContent = t(locale, "appTitle");
els.lang.textContent = t(locale, "language");
els.lang.lang = locale === "id" ? "en" : "id";
els.bannerRetry.textContent = t(locale, "retry");
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
const map = createMap(els.map);
const basemap = new Basemap(map);
const ashLayer = new AshLayer(map, (layer) => layerPopupHtml(layer, locale));
initTheme(els.toggleTheme, locale, (theme) => basemap.setTheme(theme));
const satellite = new SatelliteLayer(map);
const windLayer = new WindLayer(map, locale);
const markers = new VolcanoMarkers(map, (id) => selectVolcano(id, true));
const strip = initVolcanoStrip(els.volcanoStrip, locale, (id) => selectVolcano(id, true));
const sheet = initSheet(els.sheet, els.sheetHandle, locale);
new ResizeObserver(([entry]) => {
  if (entry) document.documentElement.style.setProperty("--sheet-h", `${Math.round(entry.contentRect.height)}px`);
}).observe(els.sheet);
initShare(els.share, locale);

let steps: TimeStep[] = [];
let stepIndex = 0;
let chips: TimeChips | null = null;
let userMarker: L.Marker | null = null;
let latest: LatestData | null = null;
/** Volcano id from the URL (?g=SMR) until the data arrives, then the selected entry. */
let selectedId: string | null = new URLSearchParams(location.search).get("g");
/** What the panels currently show, so a poll or a re-selection only rebuilds what changed. */
let rendered: { id: string | null; header: string | null } = { id: null, header: null };

const currentStep = (): TimeStep | null => steps[stepIndex] ?? null;
const selected = (): VolcanoStatus | null => latest?.volcanoes.find((v) => v.id === selectedId) ?? null;
/** Times are shown in the selected volcano's civil zone; Jakarta time until one is selected. */
const zone = (): Zone => selected()?.zone ?? "WIB";

function volcanoPopupHtml(v: VolcanoStatus): string {
  const parts = [`<strong>${escapeHtml(v.name)}</strong>`];
  if (v.region) parts.push(escapeHtml(v.region));
  if (v.elevationM !== null) parts.push(`${v.elevationM} m`);
  return parts.join("<br>");
}

/** Space the panels take on each side, so a focused volcano lands in the visible part of the map. */
function viewPadding(): { paddingTopLeft: L.PointExpression; paddingBottomRight: L.PointExpression } {
  const wide = window.matchMedia("(min-width: 900px)").matches;
  return wide ? { paddingTopLeft: [470, 80], paddingBottomRight: [30, 30] } : { paddingTopLeft: [20, 90], paddingBottomRight: [20, 220] };
}

/** Frames the volcano with its low-level zones; high zones can stretch a thousand kilometres downwind. */
function focusVolcano(v: VolcanoStatus): void {
  const step = currentStep();
  const points: L.LatLngTuple[] = [[v.lat, v.lon]];
  for (const layer of step?.layers ?? []) {
    if (isHighLayer(layer)) continue;
    for (const [lon, lat] of layer.polygon) points.push([lat, lon]);
  }
  if (points.length > 1) map.fitBounds(L.latLngBounds(points), { ...viewPadding(), maxZoom: FOCUS_MAX_ZOOM, animate: true });
  else map.setView([v.lat, v.lon], FOCUS_MAX_ZOOM, { animate: true });
}

const locationCheck = initLocationCheck({
  button: els.checkLocation,
  result: els.locationResult,
  locale,
  getStep: currentStep,
  getVolcano: selected,
  onLocated: (lat, lon) => {
    const icon = L.divIcon({ className: "", html: '<div class="user-marker"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
    if (userMarker) userMarker.setLatLng([lat, lon]);
    else userMarker = L.marker([lat, lon], { icon, zIndexOffset: 900 }).addTo(map);
    const v = selected();
    const points: L.LatLngTuple[] = v ? [[lat, lon], [v.lat, v.lon]] : [[lat, lon]];
    map.fitBounds(L.latLngBounds(points), { ...viewPadding(), maxZoom: 9 });
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
  renderLegend(els.legend, step, locale, false, selected()?.name);
  renderLegend(els.peekLegend, step, locale, true);
  locationCheck.refresh();
}

/** Makes a volcano current: steps, polygons, status, wind and, when asked, the map view. */
function selectVolcano(id: string | null, focus: boolean): void {
  selectedId = id;
  const v = selected();
  const advisory = v?.active ? v.vaac : null;
  const volcanoChanged = rendered.id !== (v?.id ?? null);
  const changed = volcanoChanged || rendered.header !== (advisory?.header ?? null);
  rendered = { id: v?.id ?? null, header: advisory?.header ?? null };
  // Rebuild the time steps only when the advisory changed, so a poll does not reset the selection.
  if (changed || !chips) {
    steps = advisory ? buildSteps(advisory, locale, zone()) : [];
    chips?.stop();
    chips = initTimeChips(els.chips, steps, locale, zone(), showStep);
    if (!steps.length) showStep(0);
  }
  renderStatus(els.status, els.statusDetail, v, latest?.sourceErrors ?? [], locale);
  renderAirportsCard(els.airportsCard, latest?.airports ?? [], v, locale);
  strip.update(latest?.volcanoes ?? [], selectedId);
  markers.update(latest?.volcanoes ?? [], selectedId, volcanoPopupHtml);
  ashLayer.showOthers((latest?.volcanoes ?? []).filter((o) => o.active && o.id !== selectedId));
  const url = new URL(location.href);
  if (v) url.searchParams.set("g", v.id);
  else url.searchParams.delete("g");
  history.replaceState(null, "", url);
  if (volcanoChanged) void loadWind();
  if (focus && v) focusVolcano(v);
}

function applyData(data: LatestData): void {
  const first = latest === null;
  latest = data;
  renderFreshness(els.freshness, data.generatedAt, new Date(), locale);
  const known = data.volcanoes.some((v) => v.id === selectedId);
  const id = known ? selectedId : data.volcanoes[0]?.id ?? null;
  selectVolcano(id, first);
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

// Wind, fetched per selected volcano and cached for the refresh interval.
let wind: WindReport | null = null;
const windCache = new Map<string, { at: number; report: WindReport | null }>();
async function loadWind(): Promise<void> {
  const v = selected();
  if (!v) {
    wind = null;
    renderWindCard(els.windCard, null, locale, zone());
    windLayer.show(null, null);
    return;
  }
  const cached = windCache.get(v.id);
  if (cached && Date.now() - cached.at < WIND_REFRESH_MS) {
    wind = cached.report;
  } else {
    try {
      wind = await fetchWind(new Date(), v.lat, v.lon);
    } catch (e) {
      // Wind is a secondary layer; the card shows "unavailable" and the map keeps working.
      console.warn(`wind: ${e instanceof Error ? e.message : String(e)}`);
      wind = null;
    }
    windCache.set(v.id, { at: Date.now(), report: wind });
    if (selected()?.id !== v.id) return; // the user moved on while we waited
  }
  renderWindCard(els.windCard, wind, locale, v.zone);
  windLayer.show(wind, v);
}

// Satellite view: the control opens a menu of views; unavailable ones are shown disabled with the reason.
const SAT_LABEL = {
  off: "satelliteOff",
  truecolor: "satelliteTrue",
  rgb: "satelliteRgb",
  signal: "satelliteSignal",
  ir: "satelliteIr",
} as const satisfies Record<SatelliteMode, string>;
const SAT_TAG = { off: null, truecolor: "tagTrue", rgb: "tagRgb", signal: "tagSignal", ir: "tagIr" } as const satisfies Record<SatelliteMode, string | null>;
const SAT_MENU = { off: "menuOff", truecolor: "menuTrue", rgb: "menuRgb", signal: "menuSignal", ir: "menuIr" } as const satisfies Record<SatelliteMode, string>;

function renderSatMenu(): void {
  const mode = satellite.mode();
  els.satMenu.innerHTML = "";
  for (const m of MODES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "menu__item";
    b.setAttribute("role", "menuitemradio");
    b.setAttribute("aria-checked", String(m === mode));
    const available = satellite.available(m);
    b.disabled = !available;
    let hint = "";
    if (!available) {
      const reason = m === "off" || m === "ir" ? null : satellite.reason(m);
      hint = `<span class="menu__hint">${t(locale, reason === "night" ? "hintNight" : "hintUnavailable")}</span>`;
    }
    b.innerHTML = `<span>${t(locale, SAT_MENU[m])}</span>${hint}`;
    b.addEventListener("click", () => {
      satellite.setMode(m);
      closeSatMenu();
      renderSatelliteControl();
    });
    els.satMenu.append(b);
  }
}
function closeSatMenu(): void {
  els.satMenu.hidden = true;
  els.toggleSat.setAttribute("aria-expanded", "false");
}
function openSatMenu(): void {
  renderSatMenu();
  els.satMenu.hidden = false;
  els.toggleSat.setAttribute("aria-expanded", "true");
  els.satMenu.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
}
document.addEventListener("click", (e) => {
  if (els.satMenu.hidden) return;
  if (e.target instanceof Node && (els.satMenu.contains(e.target) || els.toggleSat.contains(e.target))) return;
  closeSatMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.satMenu.hidden) {
    closeSatMenu();
    els.toggleSat.focus();
  }
});
function renderSatelliteControl(): void {
  const mode = satellite.mode();
  ashLayer.setOutlineOnly(mode !== "off");
  document.body.classList.toggle("sat-on", mode !== "off");
  els.toggleSat.setAttribute("aria-pressed", String(mode !== "off"));
  els.toggleSat.setAttribute("aria-label", t(locale, SAT_LABEL[mode]));
  const frame = latest?.satellite?.latestFrameTime;
  els.toggleSat.title =
    mode === "ir" && frame ? t(locale, "satelliteFrame", { time: `${formatClock(frame, zone())} ${zone()}` })
    : !satellite.available("rgb") ? `${t(locale, SAT_LABEL[mode])} · ${t(locale, "rgbUnavailable")}`
    : t(locale, SAT_LABEL[mode]);
  const tag = SAT_TAG[mode];
  els.satTag.hidden = tag === null;
  els.satTag.textContent = tag ? t(locale, tag) : "";
  if (!els.satMenu.hidden) renderSatMenu();
  const now = new Date();
  const legendMode = mode === "off" || mode === "ir" ? null : mode;
  renderSatLegend(els.legendSat, satellite.productMeta(), legendMode, now, locale, zone());
  renderSatLegend(els.peekSat, satellite.productMeta(), legendMode, now, locale, zone());
}
els.toggleSat.addEventListener("click", () => {
  if (els.satMenu.hidden) openSatMenu();
  else closeSatMenu();
});

async function loadHimawari(): Promise<void> {
  try {
    const res = await fetch(HIMAWARI_URL, { cache: "no-store" });
    if (res.status === 404) {
      satellite.setProducts(null);
    } else {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = himawariSchema.safeParse(await res.json());
      if (!parsed.success) throw new Error(parsed.error.message);
      for (const product of ["rgb", "signal", "truecolor"] as const) {
        const error = parsed.data[product].error;
        if (error && error !== "night") console.warn(`himawari ${product}: pipeline reported ${error}`);
      }
      satellite.setProducts(parsed.data);
    }
  } catch (e) {
    // The satellite products are optional; the control simply skips them until the next successful poll.
    console.warn(`himawari: ${e instanceof Error ? e.message : String(e)}`);
    satellite.setProducts(null);
  }
  renderSatelliteControl();
}
els.toggleWind.addEventListener("click", () => {
  windLayer.setVisible(!windLayer.isVisible());
  els.toggleWind.setAttribute("aria-pressed", String(windLayer.isVisible()));
});

// Boot
renderSatelliteControl();
void loadData();
void loadHimawari();
window.setInterval(() => void loadData(), REFRESH_MS);
window.setInterval(() => void loadHimawari(), REFRESH_MS);
window.setInterval(() => {
  windCache.clear();
  void loadWind();
}, WIND_REFRESH_MS);
window.setInterval(() => {
  if (latest) renderFreshness(els.freshness, latest.generatedAt, new Date(), locale);
  satellite.refresh();
}, 60_000);
