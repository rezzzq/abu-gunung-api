import L from "leaflet";
import { HIGH_LAYER_FL } from "../config";
import { driftVector, layerDriftDeg } from "../lib/drift";
import { noiseTile } from "../lib/noise";
import type { AshLayer as AshLayerData } from "../lib/schema";
import type { WindReport } from "../lib/wind-report";

/**
 * One canvas pixel covers at least this many CSS pixels; large screens scale down further so the
 * canvas stays under MAX_PIXELS. Smoke is soft, so the low resolution is invisible and cheap.
 */
const MIN_SCALE = 2;
const MAX_PIXELS = 260_000;
const FPS = 12;
const TILE = 256;
/** Extra canvas around the viewport so a drag does not expose blank edges before the next redraw. */
const PADDING = 0.15;
/** Width of the band inside the true boundary that fades to nothing, in CSS px. */
const FEATHER_CSS = 28;
/** How fast the texture slides downwind, in CSS px per second. */
const DRIFT_CSS_PER_S = 7;

interface Cloud {
  path: Path2D;
  color: string;
  shade: CanvasPattern;
  alpha: number;
  drift: { x: number; y: number };
}

type Rgb = [number, number, number];

/**
 * Pattern whose alpha channel carries the noise. Drawn with destination-in it modulates density;
 * drawn with source-atop in a darker colour it shades the dense parts.
 */
function makePattern(ctx: CanvasRenderingContext2D, bytes: Uint8ClampedArray, floor: number, rgb: Rgb = [255, 255, 255]): CanvasPattern {
  const tile = document.createElement("canvas");
  tile.width = tile.height = TILE;
  const tctx = tile.getContext("2d");
  if (!tctx) throw new Error("2D canvas is not available");
  const img = tctx.createImageData(TILE, TILE);
  for (let i = 0; i < bytes.length; i++) {
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
    img.data[i * 4 + 3] = Math.round(255 * (floor + (1 - floor) * (bytes[i]! / 255)));
  }
  tctx.putImageData(img, 0, 0);
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) throw new Error("Could not create the smoke pattern");
  return pattern;
}

/** Resolves any CSS colour to RGB by painting one pixel, so the theme can use any notation. */
function toRgb(ctx: CanvasRenderingContext2D, color: string): Rgb {
  ctx.save();
  ctx.globalCompositeOperation = "copy";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  ctx.restore();
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!];
}

/**
 * Draws the VAAC ash polygons as drifting smoke on a canvas beneath the vector outlines.
 * The true boundary is respected: density fades to zero at the polygon edge and never spills past it.
 */
export class SmokeLayer {
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly work = document.createElement("canvas");
  private readonly wctx: CanvasRenderingContext2D;
  private readonly bytes: Uint8ClampedArray;
  private readonly fine: CanvasPattern;
  private readonly coarse: CanvasPattern;
  private readonly edge: CanvasPattern;
  private shades = { low: null as CanvasPattern | null, high: null as CanvasPattern | null };
  private readonly supportsFilter: boolean;
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private origin = L.point(0, 0);
  private scale = MIN_SCALE;
  private layers: AshLayerData[] = [];
  private wind: WindReport | null = null;
  private colors = { low: "#e08a1e", high: "#6d28d9" };
  private clouds: Cloud[] = [];
  private frame: number | null = null;
  private lastDraw = 0;
  private readonly t0 = performance.now();

  constructor(private readonly map: L.Map) {
    const ctx = this.canvas.getContext("2d");
    const wctx = this.work.getContext("2d");
    if (!ctx || !wctx) throw new Error("2D canvas is not available");
    this.ctx = ctx;
    this.wctx = wctx;
    this.supportsFilter = "filter" in wctx;
    this.bytes = noiseTile(TILE, { octaves: 5, seed: 1883 });
    this.fine = makePattern(wctx, this.bytes, 0.15);
    this.coarse = makePattern(wctx, this.bytes, 0.45);
    this.edge = makePattern(wctx, this.bytes, 0);

    this.canvas.className = "ash-smoke leaflet-zoom-hide";
    const pane = map.getPane("ash-smoke") ?? map.createPane("ash-smoke");
    pane.style.zIndex = "390";
    pane.append(this.canvas);
    map.on("moveend zoomend viewreset resize", this.reset, this);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.reset();
  }

  setLayers(layers: AshLayerData[]): void {
    this.layers = layers;
    this.rebuild();
  }

  setWind(wind: WindReport | null): void {
    this.wind = wind;
    this.rebuild();
  }

  /** Re-reads the ash colours from CSS custom properties, e.g. after a theme change. */
  refreshTheme(): void {
    const style = getComputedStyle(document.documentElement);
    const low = style.getPropertyValue("--ash-low").trim();
    const high = style.getPropertyValue("--ash-high").trim();
    if (low) this.colors.low = low;
    if (high) this.colors.high = high;
    this.shades = { low: null, high: null };
    this.rebuild();
  }

  /** Darker tone of the layer colour, carried by the noise alpha, for the shading pass. */
  private shadeFor(kind: "low" | "high"): CanvasPattern {
    let shade = this.shades[kind];
    if (!shade) {
      const dark = toRgb(this.wctx, this.colors[kind]).map((c) => Math.round(c * 0.45)) as Rgb;
      shade = makePattern(this.wctx, this.bytes, 0, dark);
      this.shades[kind] = shade;
    }
    return shade;
  }

  destroy(): void {
    this.stop();
    this.map.off("moveend zoomend viewreset resize", this.reset, this);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.canvas.remove();
  }

  private readonly onVisibility = (): void => {
    if (!document.hidden) this.schedule();
  };

  /** Resizes and repositions the canvas to the current view, then rebuilds the paths. */
  private reset(): void {
    const size = this.map.getSize();
    const pad = size.multiplyBy(PADDING).round();
    const full = size.add(pad.multiplyBy(2));
    this.origin = this.map.containerPointToLayerPoint(pad.multiplyBy(-1));
    L.DomUtil.setPosition(this.canvas, this.origin);
    this.canvas.style.width = `${full.x}px`;
    this.canvas.style.height = `${full.y}px`;
    this.scale = Math.max(MIN_SCALE, Math.ceil(Math.sqrt((full.x * full.y) / MAX_PIXELS)));
    const w = Math.max(1, Math.ceil(full.x / this.scale));
    const h = Math.max(1, Math.ceil(full.y / this.scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = this.work.width = w;
      this.canvas.height = this.work.height = h;
    }
    this.rebuild();
  }

  private rebuild(): void {
    const sorted = [...this.layers].sort((a, b) => Number(b.topFl >= HIGH_LAYER_FL) - Number(a.topFl >= HIGH_LAYER_FL));
    this.clouds = sorted.map((layer) => {
      const high = layer.topFl >= HIGH_LAYER_FL;
      const path = new Path2D();
      layer.polygon.forEach(([lon, lat], i) => {
        const p = this.map.latLngToLayerPoint([lat, lon]).subtract(this.origin).divideBy(this.scale);
        if (i === 0) path.moveTo(p.x, p.y);
        else path.lineTo(p.x, p.y);
      });
      path.closePath();
      const bearing = layerDriftDeg(layer, this.wind);
      return {
        path,
        color: high ? this.colors.high : this.colors.low,
        shade: this.shadeFor(high ? "high" : "low"),
        alpha: high ? 0.72 : 0.86,
        drift: bearing === null ? { x: 0, y: 0 } : driftVector(bearing),
      };
    });
    this.schedule();
  }

  private schedule(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(this.tick);
  }

  private stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private readonly tick = (now: number): void => {
    this.frame = null;
    if (document.hidden) return;
    if (now - this.lastDraw >= 1000 / FPS) {
      this.lastDraw = now;
      this.render(now);
    }
    // Static picture when the user asked for reduced motion or there is nothing to animate.
    if (!this.reducedMotion && this.clouds.length) this.schedule();
  };

  private render(now: number): void {
    const { ctx, wctx, canvas, work } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const t = (now - this.t0) / 1000;
    const k = MIN_SCALE / this.scale;
    const slide = (t * DRIFT_CSS_PER_S) / this.scale;
    const sway = Math.sin(t * 0.25) * 6 * k;
    const feather = FEATHER_CSS / this.scale;

    for (const cloud of this.clouds) {
      wctx.globalCompositeOperation = "source-over";
      wctx.globalAlpha = 1;
      wctx.filter = "none";
      wctx.clearRect(0, 0, w, h);
      wctx.fillStyle = cloud.color;
      wctx.fill(cloud.path);

      // Two noise fields sliding at different speeds give the texture a slow billow. The fine field
      // is stretched along the drift so the smoke forms streaks in the direction it travels.
      wctx.globalCompositeOperation = "destination-in";
      const { x: dx, y: dy } = cloud.drift;
      const moving = dx !== 0 || dy !== 0;
      const angle = moving ? (Math.atan2(dy, dx) * 180) / Math.PI : -20;
      this.fine.setTransform(new DOMMatrix().translate(dx * slide, dy * slide).rotate(angle).scale(1.1 * k, 0.5 * k));
      wctx.fillStyle = this.fine;
      wctx.fillRect(0, 0, w, h);
      this.coarse.setTransform(new DOMMatrix().translate(dx * slide * 0.45 - dy * sway, dy * slide * 0.45 + dx * sway).scale(2.2 * k));
      wctx.fillStyle = this.coarse;
      wctx.fillRect(0, 0, w, h);

      // Darker cores where a third, offset noise field is dense give the cloud some depth.
      wctx.globalCompositeOperation = "source-atop";
      wctx.globalAlpha = 0.6;
      cloud.shade.setTransform(new DOMMatrix().translate(dx * slide * 0.7 + 71, dy * slide * 0.7 + 37).scale(1.3 * k));
      wctx.fillStyle = cloud.shade;
      wctx.fillRect(0, 0, w, h);
      wctx.globalAlpha = 1;

      // Thin the cloud towards its real edge. A wide full-contrast noise stroke tears the contour so the
      // straight advisory lines do not show; a blurred stroke then guarantees zero density at the boundary.
      wctx.globalCompositeOperation = "destination-out";
      wctx.lineJoin = "round";
      this.edge.setTransform(new DOMMatrix().translate(dx * slide * 0.3 + 23, dy * slide * 0.3 + 149).scale(1.5 * k));
      wctx.strokeStyle = this.edge;
      wctx.lineWidth = feather * 3.4;
      wctx.stroke(cloud.path);
      wctx.strokeStyle = this.coarse;
      wctx.globalAlpha = 0.6;
      wctx.lineWidth = feather * 1.6;
      wctx.stroke(cloud.path);
      wctx.globalAlpha = 1;
      wctx.strokeStyle = "#fff";
      if (this.supportsFilter) {
        wctx.filter = `blur(${feather / 2}px)`;
        wctx.lineWidth = feather;
        wctx.stroke(cloud.path);
        wctx.filter = "none";
      } else {
        const steps = 6;
        for (let i = 1; i <= steps; i++) {
          wctx.globalAlpha = 0.35;
          wctx.lineWidth = (feather * 1.4 * i) / steps;
          wctx.stroke(cloud.path);
        }
        wctx.globalAlpha = 1;
      }

      ctx.globalAlpha = cloud.alpha;
      ctx.drawImage(work, 0, 0);
    }
    ctx.globalAlpha = 1;
  }
}
