import L from "leaflet";
import { COLORS, HIGH_LAYER_FL } from "../config";
import { closeRing } from "../lib/geo";
import type { AshLayer as AshLayerData, VolcanoStatus } from "../lib/schema";

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
  private readonly others: L.LayerGroup;
  private outlineOnly = false;

  constructor(map: L.Map, private readonly popupHtml: (layer: AshLayerData) => string) {
    this.others = L.layerGroup().addTo(map);
    this.group = L.layerGroup().addTo(map);
  }

  /** Current observed zones of the other active volcanoes, as thin dashed outlines without fills. */
  showOthers(volcanoes: VolcanoStatus[]): void {
    this.others.clearLayers();
    for (const v of volcanoes) {
      for (const layer of v.vaac?.observation?.layers ?? []) {
        const latLngs = closeRing(layer.polygon).map(([lon, lat]) => L.latLng(lat, lon));
        L.polygon(latLngs, {
          color: isHighLayer(layer) ? COLORS.purple : COLORS.amber,
          weight: 1.5,
          opacity: 0.7,
          dashArray: "4 4",
          fill: false,
          interactive: false,
          className: "ash ash--other",
        }).addTo(this.others);
      }
    }
  }

  /** Thin fills so satellite imagery underneath stays readable; the boundary and taps remain. */
  setOutlineOnly(outlineOnly: boolean): void {
    this.outlineOnly = outlineOnly;
    this.group.eachLayer((layer) => {
      if (layer instanceof L.Polygon) layer.setStyle({ fillOpacity: this.fillOpacity(layer.options.className?.includes("ash--high") ?? false) });
    });
  }

  private fillOpacity(high: boolean): number {
    if (this.outlineOnly) return high ? 0.12 : 0.06;
    return high ? 1 : 0.4;
  }

  show(step: TimeStep | null): void {
    this.group.clearLayers();
    if (!step) return;
    // Draw high layers first so the (usually smaller) low layer stays clickable on top.
    const ordered = [...step.layers].sort((a, b) => Number(isHighLayer(b)) - Number(isHighLayer(a)));
    for (const layer of ordered) {
      const latLngs = closeRing(layer.polygon).map(([lon, lat]) => L.latLng(lat, lon));
      const high = isHighLayer(layer);
      const polygon = L.polygon(latLngs, {
        color: high ? COLORS.purple : COLORS.amber,
        weight: 2,
        opacity: 0.95,
        fillColor: high ? "url(#ash-hatch)" : COLORS.amber,
        fillOpacity: this.fillOpacity(high),
        className: high ? "ash ash--high" : "ash ash--low",
      });
      polygon.bindPopup(this.popupHtml(layer));
      polygon.addTo(this.group);
    }
  }

  clear(): void {
    this.group.clearLayers();
  }
}
