import L from "leaflet";
import { SATELLITE } from "../config";

/** Himawari-9 clean infrared from NASA GIBS; the "default" time keeps it on the newest frame. */
export class SatelliteLayer {
  private readonly layer: L.TileLayer;
  private visible = false;

  constructor(private readonly map: L.Map) {
    this.layer = L.tileLayer(SATELLITE.url, {
      pane: "satellite",
      maxNativeZoom: SATELLITE.maxNativeZoom,
      maxZoom: 19,
      opacity: 0.7,
      attribution: SATELLITE.attribution,
      crossOrigin: true,
    });
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    if (v) this.layer.addTo(this.map);
    else this.layer.remove();
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Forces tiles to re-request so a long-open page picks up newer frames. */
  refresh(): void {
    if (this.visible) this.layer.redraw();
  }
}
