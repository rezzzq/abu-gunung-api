import L from "leaflet";
import { HIMAWARI_RGB_URL, SATELLITE } from "../config";
import type { HimawariRgb } from "../lib/schema";

export type SatelliteMode = "off" | "rgb" | "ir";

/**
 * Two satellite views of the same Himawari-9 data, in one pane under the ash polygons:
 * the JMA Ash RGB composite rendered by scripts/ash_rgb.py (2 km, our region only) and the
 * clean infrared tiles from NASA GIBS (global, newest frame).
 */
export class SatelliteLayer {
  private readonly infrared: L.TileLayer;
  private rgb: L.ImageOverlay | null = null;
  private meta: HimawariRgb | null = null;
  private current: SatelliteMode = "off";

  constructor(private readonly map: L.Map) {
    this.infrared = L.tileLayer(SATELLITE.url, {
      pane: "satellite",
      maxNativeZoom: SATELLITE.maxNativeZoom,
      maxZoom: 19,
      opacity: 0.7,
      attribution: SATELLITE.attribution,
      crossOrigin: true,
    });
  }

  /** Latest Ash RGB sidecar; null or an error record without an image makes that mode unavailable. */
  setRgb(meta: HimawariRgb | null): void {
    this.meta = meta;
    const previous = this.rgb;
    this.rgb = null;
    if (meta?.image && meta.scanTime) {
      const { west, south, east, north } = meta.bounds;
      const url = `${HIMAWARI_RGB_URL.replace(/[^/]+$/, "")}${meta.image}?v=${encodeURIComponent(meta.scanTime)}`;
      this.rgb = L.imageOverlay(url, [[south, west], [north, east]], {
        pane: "satellite",
        opacity: 0.85,
        attribution: SATELLITE.rgbAttribution,
        crossOrigin: "anonymous",
      });
    }
    if (previous) previous.remove();
    if (this.current === "rgb") {
      if (this.rgb) this.rgb.addTo(this.map);
      else this.setMode("off");
    }
  }

  rgbAvailable(): boolean {
    return this.rgb !== null;
  }

  rgbMeta(): HimawariRgb | null {
    return this.meta;
  }

  mode(): SatelliteMode {
    return this.current;
  }

  setMode(mode: SatelliteMode): void {
    if (mode === "rgb" && !this.rgb) mode = "off";
    if (mode === this.current) return;
    this.infrared.remove();
    this.rgb?.remove();
    this.current = mode;
    if (mode === "ir") this.infrared.addTo(this.map);
    if (mode === "rgb") this.rgb?.addTo(this.map);
  }

  /** Off, Ash RGB (when available), infrared, then off again. */
  next(): SatelliteMode {
    const order: SatelliteMode[] = this.rgb ? ["off", "rgb", "ir"] : ["off", "ir"];
    const i = order.indexOf(this.current);
    return order[(i + 1) % order.length] ?? "off";
  }

  /** Forces tiles to re-request so a long-open page picks up newer frames. */
  refresh(): void {
    if (this.current === "ir") this.infrared.redraw();
  }
}
