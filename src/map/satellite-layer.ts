import L from "leaflet";
import { HIMAWARI_URL, SATELLITE } from "../config";
import type { Himawari } from "../lib/schema";

export type SatelliteMode = "off" | "truecolor" | "rgb" | "signal" | "ir";
export type Product = "truecolor" | "rgb" | "signal";
export const PRODUCTS: Product[] = ["truecolor", "rgb", "signal"];
/** Menu order. */
export const MODES: SatelliteMode[] = ["off", "truecolor", "rgb", "signal", "ir"];

/**
 * Satellite views in one pane under the ash polygons: the products rendered by
 * scripts/himawari.py (true colour by day, the JMA Ash RGB, the experimental ash
 * signal; 2 km, Indonesia only) and the clean infrared tiles from NASA GIBS.
 */
export class SatelliteLayer {
  private readonly infrared: L.TileLayer;
  private readonly overlays: Record<Product, L.ImageOverlay | null> = { truecolor: null, rgb: null, signal: null };
  private meta: Himawari | null = null;
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

  /** Latest sidecar; a product without an image (missing, night or failed) makes its mode unavailable. */
  setProducts(meta: Himawari | null): void {
    this.meta = meta;
    for (const product of PRODUCTS) {
      const previous = this.overlays[product];
      this.overlays[product] = null;
      const image = meta?.[product].image;
      if (meta && image && meta.scanTime) {
        const { west, south, east, north } = meta.bounds;
        const url = `${HIMAWARI_URL.replace(/[^/]+$/, "")}${image}?v=${encodeURIComponent(meta.scanTime)}`;
        this.overlays[product] = L.imageOverlay(url, [[south, west], [north, east]], {
          pane: "satellite",
          opacity: product === "signal" ? 0.95 : 0.9,
          attribution: SATELLITE.rgbAttribution,
          crossOrigin: "anonymous",
          className: `sat-${product}`,
        });
      }
      previous?.remove();
    }
    if (this.current !== "off" && this.current !== "ir") {
      const overlay = this.overlays[this.current];
      if (overlay) overlay.addTo(this.map);
      else this.setMode("off");
    }
  }

  available(mode: SatelliteMode): boolean {
    if (mode === "off" || mode === "ir") return true;
    return this.overlays[mode] !== null;
  }

  /** Why a product is missing: "night" for true colour outside daylight, else the pipeline error or null. */
  reason(product: Product): string | null {
    return this.meta?.[product].error ?? null;
  }

  productMeta(): Himawari | null {
    return this.meta;
  }

  mode(): SatelliteMode {
    return this.current;
  }

  setMode(mode: SatelliteMode): void {
    if (!this.available(mode)) mode = "off";
    if (mode === this.current) return;
    this.infrared.remove();
    for (const product of PRODUCTS) this.overlays[product]?.remove();
    this.current = mode;
    if (mode === "ir") this.infrared.addTo(this.map);
    else if (mode !== "off") this.overlays[mode]?.addTo(this.map);
  }

  /** Forces tiles to re-request so a long-open page picks up newer frames. */
  refresh(): void {
    if (this.current === "ir") this.infrared.redraw();
  }
}
