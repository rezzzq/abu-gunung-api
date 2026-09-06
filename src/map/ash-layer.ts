import L from "leaflet";
import { COLORS, HIGH_LAYER_FL } from "../config";
import { closeRing } from "../lib/geo";
import type { AshLayer as AshLayerData } from "../lib/schema";
import type { WindReport } from "../lib/wind-report";
import { SmokeLayer } from "./smoke-layer";

export interface TimeStep {
  /** Short chip label, e.g. "Sekarang" or "+6 jam". */
  label: string;
  /** ISO time the step is valid for. */
  time: string;
  /** Sentence for the details panel, e.g. "Diamati 07.10 WIB". */
  description: string;
  layers: AshLayerData[];
}

export function isHighLayer(layer: AshLayerData): boolean {
  return layer.topFl >= HIGH_LAYER_FL;
}

/**
 * Ash coverage for one time step. The smoke canvas carries the look; thin vector outlines
 * on top mark the exact advisory boundary and take the taps that open the detail popups.
 */
export class AshLayer {
  private readonly group: L.LayerGroup;
  private readonly smoke: SmokeLayer;

  constructor(map: L.Map, private readonly popupHtml: (layer: AshLayerData) => string) {
    this.group = L.layerGroup().addTo(map);
    this.smoke = new SmokeLayer(map);
  }

  show(step: TimeStep | null): void {
    this.group.clearLayers();
    this.smoke.setLayers(step?.layers ?? []);
    if (!step) return;
    // Draw high layers first so the (usually smaller) low layer stays clickable on top.
    const ordered = [...step.layers].sort((a, b) => Number(isHighLayer(b)) - Number(isHighLayer(a)));
    for (const layer of ordered) {
      const latLngs = closeRing(layer.polygon).map(([lon, lat]) => L.latLng(lat, lon));
      const high = isHighLayer(layer);
      const polygon = L.polygon(latLngs, {
        color: high ? COLORS.purple : COLORS.amber,
        weight: 1,
        opacity: 0.45,
        // A transparent fill keeps the whole area tappable without hiding the smoke below.
        fillColor: high ? COLORS.purple : COLORS.amber,
        fillOpacity: 0,
        className: high ? "ash ash--high" : "ash ash--low",
      });
      polygon.bindPopup(this.popupHtml(layer));
      polygon.addTo(this.group);
    }
  }

  setWind(report: WindReport | null): void {
    this.smoke.setWind(report);
  }

  refreshTheme(): void {
    this.smoke.refreshTheme();
  }

  clear(): void {
    this.group.clearLayers();
    this.smoke.setLayers([]);
  }
}
