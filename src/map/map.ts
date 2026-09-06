import L from "leaflet";
import { COLORS, INITIAL_VIEW } from "../config";

/** Adds an SVG hatch pattern to the map's vector renderer so high ash layers can use it as fill. */
function addHatchPattern(map: L.Map): void {
  const renderer = map.getRenderer(L.polyline([]) as unknown as L.Path);
  const container = (renderer as unknown as { _container?: SVGSVGElement })._container;
  if (!container || container.querySelector("#ash-hatch")) return;
  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs");
  const pattern = document.createElementNS(ns, "pattern");
  pattern.setAttribute("id", "ash-hatch");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", "8");
  pattern.setAttribute("height", "8");
  pattern.setAttribute("patternTransform", "rotate(45)");
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("width", "8");
  bg.setAttribute("height", "8");
  bg.setAttribute("fill", COLORS.purple);
  bg.setAttribute("fill-opacity", "0.12");
  const line = document.createElementNS(ns, "rect");
  line.setAttribute("width", "3");
  line.setAttribute("height", "8");
  line.setAttribute("fill", COLORS.purple);
  line.setAttribute("fill-opacity", "0.5");
  pattern.append(bg, line);
  defs.append(pattern);
  container.prepend(defs);
}

/** Creates the map shell. Basemap tiles and volcano markers are added separately. */
export function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, {
    center: INITIAL_VIEW.center,
    zoom: INITIAL_VIEW.zoom,
    zoomControl: false,
    attributionControl: true,
    worldCopyJump: true,
  });
  map.createPane("satellite").style.zIndex = "350";
  map.createPane("wind").style.zIndex = "450";

  addHatchPattern(map);
  // On wide screens the left panel covers part of the map; shift the view so the strait stays visible.
  if (window.matchMedia("(min-width: 900px)").matches) map.panBy([-220, 0], { animate: false });
  return map;
}
