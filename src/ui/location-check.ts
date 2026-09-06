import { t, type Locale } from "../i18n";
import { formatAltitude } from "../lib/flight-level";
import { distanceKm, layersContaining } from "../lib/geo";
import { isHighLayer, type TimeStep } from "../map/ash-layer";
import { escapeHtml } from "./status-card";

const GEO_TIMEOUT_MS = 10_000;

export interface LocationCheckOptions {
  button: HTMLButtonElement;
  result: HTMLElement;
  locale: Locale;
  getStep: () => TimeStep | null;
  /** The selected volcano; null while nothing is selected. */
  getVolcano: () => { name: string; lat: number; lon: number } | null;
  onLocated: (lat: number, lon: number) => void;
}

export interface LocationCheck {
  /** Re-runs the containment test for a new step without asking for the position again. */
  refresh(): void;
  request(): void;
}

export function initLocationCheck(opts: LocationCheckOptions): LocationCheck {
  const { button, result, locale } = opts;
  let position: { lat: number; lon: number } | null = null;
  button.textContent = t(locale, "checkLocation");

  const render = (): void => {
    if (!position) return;
    const step = opts.getStep();
    const volcano = opts.getVolcano();
    if (!volcano) {
      result.className = "location-result";
      result.textContent = t(locale, "noVolcanoes");
      return;
    }
    const km = Math.round(distanceKm(position.lon, position.lat, volcano.lon, volcano.lat));
    const inside = step ? layersContaining(position.lon, position.lat, step.layers) : [];
    const labels = inside
      .map((l) => `${t(locale, isHighLayer(l) ? "layerHigh" : "layerLow").toLowerCase()} ≤ ${formatAltitude(l.topFl, locale)}`)
      .join("; ");
    const verdict = inside.length ? t(locale, "insideAsh", { layers: labels }) : t(locale, "outsideAsh");
    result.className = `location-result ${inside.length ? "inside" : "outside"}`;
    result.innerHTML = `<strong>${escapeHtml(verdict)}</strong>${escapeHtml(t(locale, "distanceFrom", { km, name: volcano.name }))}<br><span class="hint">${escapeHtml(t(locale, "forecastCaveat"))}</span>`;
  };

  const fail = (key: "locationDenied" | "locationUnsupported"): void => {
    result.className = "location-result error";
    result.textContent = t(locale, key);
    button.disabled = false;
    button.textContent = t(locale, "checkLocation");
  };

  const request = (): void => {
    if (!("geolocation" in navigator)) {
      fail("locationUnsupported");
      return;
    }
    button.disabled = true;
    button.textContent = t(locale, "locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        position = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        button.disabled = false;
        button.textContent = t(locale, "checkLocation");
        opts.onLocated(position.lat, position.lon);
        render();
      },
      () => fail("locationDenied"),
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 5 * 60_000 },
    );
  };

  button.addEventListener("click", request);
  return { refresh: render, request };
}
