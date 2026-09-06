import L from "leaflet";
import { BASEMAP } from "../config";
import type { Theme } from "../lib/theme";

/** Swaps the background tiles to match the light or dark theme. */
export class Basemap {
  private current: L.LayerGroup | null = null;
  private theme: Theme | null = null;

  constructor(private readonly map: L.Map) {}

  setTheme(theme: Theme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.current?.remove();
    const spec = BASEMAP[theme];
    const tiles = spec.layers.map((url, i) =>
      L.tileLayer(url, { attribution: i === 0 ? spec.attribution : undefined, maxZoom: spec.maxZoom }),
    );
    this.current = L.layerGroup(tiles).addTo(this.map);
  }
}
