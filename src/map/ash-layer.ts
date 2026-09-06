import L from "leaflet";
import { COLORS, HIGH_LAYER_FL } from "../config";
import { closeRing } from "../lib/geo";
import type { AshLayer as AshLayerData } from "../lib/schema";

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

export class AshLayer {
  private readonly group: L.LayerGroup;
  private fitted = false;

  constructor(
    private readonly map: L.Map,
    private readonly popupHtml: (layer: AshLayerData) => string,
  ) {
    this.group = L.layerGroup().addTo(map);
  }

  show(step: TimeStep | null): void {
    this.group.clearLayers();
    if (!step) return;
    // Draw high layers first so the (usually smaller) low layer stays clickable on top.
    const ordered = [...step.layers].sort((a, b) => Number(isHighLayer(b)) - Number(isHighLayer(a)));
    const bounds = L.latLngBounds([]);
    for (const layer of ordered) {
      const latLngs = closeRing(layer.polygon).map(([lon, lat]) => L.latLng(lat, lon));
      const high = isHighLayer(layer);
      const polygon = L.polygon(latLngs, {
        color: high ? COLORS.purple : COLORS.amber,
        weight: 2,
        opacity: 0.95,
        fillColor: high ? "url(#ash-hatch)" : COLORS.amber,
        fillOpacity: high ? 1 : 0.4,
        className: high ? "ash ash--high" : "ash ash--low",
      });
      polygon.bindPopup(this.popupHtml(layer));
      polygon.addTo(this.group);
      bounds.extend(polygon.getBounds());
    }
    if (!this.fitted && bounds.isValid()) {
      this.fitted = true;
      this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8, animate: false });
    }
  }

  clear(): void {
    this.group.clearLayers();
  }
}
