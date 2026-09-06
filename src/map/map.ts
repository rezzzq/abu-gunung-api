import L from "leaflet";
import { INITIAL_VIEW, VOLCANO } from "../config";

/** Creates the map shell. The basemap tiles are added separately so they can follow the theme. */
export function createMap(el: HTMLElement, volcanoPopupHtml: string): L.Map {
  const map = L.map(el, {
    center: INITIAL_VIEW.center,
    zoom: INITIAL_VIEW.zoom,
    zoomControl: false,
    attributionControl: true,
    worldCopyJump: true,
  });
  map.createPane("satellite").style.zIndex = "350";
  map.createPane("wind").style.zIndex = "450";

  const icon = L.divIcon({ className: "", html: '<div class="volcano-marker"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
  L.marker([VOLCANO.lat, VOLCANO.lon], { icon, zIndexOffset: 1000, keyboard: true, title: VOLCANO.name })
    .bindPopup(volcanoPopupHtml)
    .addTo(map);

  // On wide screens the left panel covers part of the map; shift the view so the strait stays visible.
  if (window.matchMedia("(min-width: 900px)").matches) map.panBy([-220, 0], { animate: false });
  return map;
}
