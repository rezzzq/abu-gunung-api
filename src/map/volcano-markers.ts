import L from "leaflet";
import type { VolcanoStatus } from "../lib/schema";

/**
 * One marker per listed volcano. The selected volcano wears the pulsing ring;
 * the others are small dots coloured by PVMBG level. Tapping any marker selects it.
 */
export class VolcanoMarkers {
  private readonly group = L.layerGroup();
  private readonly markers = new Map<string, L.Marker>();

  constructor(private readonly map: L.Map, private readonly onSelect: (id: string) => void) {
    this.group.addTo(map);
  }

  update(volcanoes: VolcanoStatus[], selectedId: string | null, popupHtml: (v: VolcanoStatus) => string): void {
    const seen = new Set<string>();
    for (const v of volcanoes) {
      seen.add(v.id);
      const selected = v.id === selectedId;
      const level = v.activityLevel?.level ?? 0;
      const icon = selected
        ? L.divIcon({ className: "", html: '<div class="volcano-marker"></div>', iconSize: [22, 22], iconAnchor: [11, 11] })
        : L.divIcon({
            className: "",
            html: `<div class="volcano-dot volcano-dot--level${level}${v.active ? " volcano-dot--active" : ""}"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          });
      let marker = this.markers.get(v.id);
      if (!marker) {
        marker = L.marker([v.lat, v.lon], { icon, keyboard: true, title: v.name, zIndexOffset: selected ? 1000 : 500 });
        marker.on("click", () => this.onSelect(v.id));
        marker.addTo(this.group);
        this.markers.set(v.id, marker);
      } else {
        marker.setLatLng([v.lat, v.lon]);
        marker.setIcon(icon);
        marker.setZIndexOffset(selected ? 1000 : 500);
      }
      marker.bindPopup(popupHtml(v));
    }
    for (const [id, marker] of this.markers) {
      if (!seen.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
    }
  }
}
