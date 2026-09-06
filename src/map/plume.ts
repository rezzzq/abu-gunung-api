import type L from "leaflet";
import { driftVector } from "../lib/plume";

const PUFF_COUNT = 7;

/** Markup for the animated smoke puffs; goes inside the volcano marker. */
export function plumeHtml(): string {
  return `<div class="plume" aria-hidden="true">${"<i></i>".repeat(PUFF_COUNT)}</div>`;
}

/** Points the CSS smoke animation downwind and hides it when no ash advisory is active. */
export class Plume {
  private drift = "";

  constructor(private readonly marker: L.Marker) {}

  /** `bearingDeg` is where the ash travels toward; null means "no wind data yet", so puffs just spread. */
  setDrift(bearingDeg: number | null): void {
    const el = this.marker.getElement();
    if (!el) return;
    const { x, y } = bearingDeg === null ? { x: 0, y: 0 } : driftVector(bearingDeg);
    const key = `${x.toFixed(3)},${y.toFixed(3)}`;
    if (key === this.drift) return;
    this.drift = key;
    el.style.setProperty("--dx", x.toFixed(3));
    el.style.setProperty("--dy", y.toFixed(3));
    // Keyframes that read custom properties are not re-resolved everywhere once an
    // animation is running, so swap the puffs for a fresh copy to restart them.
    const plume = el.querySelector(".plume");
    plume?.replaceWith(plume.cloneNode(true));
  }

  setActive(active: boolean): void {
    this.marker.getElement()?.classList.toggle("volcano-marker--quiet", !active);
  }
}
