import L from "leaflet";
import { HIMAWARI_URL, SATELLITE } from "../config";
import type { Himawari } from "../lib/schema";

export type SatelliteMode = "off" | "rgb" | "signal" | "ir";
type Product = "rgb" | "signal";

/**
 * Satellite views in one pane under the ash polygons: the JMA Ash RGB and the
 * experimental ash signal rendered by scripts/himawari.py (2 km, Indonesia only),
 * and the clean infrared tiles from NASA GIBS (global, newest frame).
 */
export class SatelliteLayer {
  private readonly infrared: L.TileLayer;
  private readonly overlays: Record<Product, L.ImageOverlay | null> = { rgb: null, signal: null };
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

  /** Latest sidecar; a product without an image (missing or failed) makes its mode unavailable. */
  setProducts(meta: Himawari | null): void {
    this.meta = meta;
    for (const product of ["rgb", "signal"] as const) {
      const previous = this.overlays[product];
      this.overlays[product] = null;
      const image = meta?.[product].image;
      if (meta && image && meta.scanTime) {
        const { west, south, east, north } = meta.bounds;
        const url = `${HIMAWARI_URL.replace(/[^/]+$/, "")}${image}?v=${encodeURIComponent(meta.scanTime)}`;
        this.overlays[product] = L.imageOverlay(url, [[south, west], [north, east]], {
          pane: "satellite",
          opacity: product === "rgb" ? 0.85 : 0.95,
          attribution: SATELLITE.rgbAttribution,
          crossOrigin: "anonymous",
          className: product === "signal" ? "ash-signal" : "ash-rgb",
        });
      }
      previous?.remove();
    }
    if (this.current === "rgb" || this.current === "signal") {
      const overlay = this.overlays[this.current];
      if (overlay) overlay.addTo(this.map);
      else this.setMode("off");
    }
  }

  available(product: Product): boolean {
    return this.overlays[product] !== null;
  }

  productMeta(): Himawari | null {
    return this.meta;
  }

  mode(): SatelliteMode {
    return this.current;
  }

  setMode(mode: SatelliteMode): void {
    if ((mode === "rgb" || mode === "signal") && !this.overlays[mode]) mode = "off";
    if (mode === this.current) return;
    this.infrared.remove();
    this.overlays.rgb?.remove();
    this.overlays.signal?.remove();
    this.current = mode;
    if (mode === "ir") this.infrared.addTo(this.map);
    else if (mode !== "off") this.overlays[mode]?.addTo(this.map);
  }

  /** Off, Ash RGB, ash signal (each when available), infrared, then off again. */
  next(): SatelliteMode {
    const order: SatelliteMode[] = ["off"];
    if (this.overlays.rgb) order.push("rgb");
    if (this.overlays.signal) order.push("signal");
    order.push("ir");
    const i = order.indexOf(this.current);
    return order[(i + 1) % order.length] ?? "off";
  }

  /** Forces tiles to re-request so a long-open page picks up newer frames. */
  refresh(): void {
    if (this.current === "ir") this.infrared.redraw();
  }
}
