import { VOLCANO } from "./lib/volcano";

export { VOLCANO };

export const DATA_URL = `${import.meta.env.BASE_URL}data/latest.json`;
/** How often the browser re-reads latest.json. */
export const REFRESH_MS = 5 * 60 * 1000;
/** How often the wind forecast is refreshed. */
export const WIND_REFRESH_MS = 30 * 60 * 1000;
/** Freshness thresholds, in minutes since generatedAt. */
export const STALE_WARN_MIN = 180;
export const STALE_BAD_MIN = 720;
/** Layers whose top is at or above this flight level count as "high" ash. */
export const HIGH_LAYER_FL = 250;

/** Sunda Strait with Jakarta and Bandar Lampung both on screen on a phone at this zoom. */
export const INITIAL_VIEW = { center: [-6.3, 105.6] as [number, number], zoom: 7 };

export const BASEMAP = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS',
  maxZoom: 19,
};

export const SATELLITE = {
  layer: "Himawari_AHI_Band13_Clean_Infrared",
  // "default" as the time selects the newest available 10-minute frame.
  url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Himawari_AHI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
  maxNativeZoom: 6,
  attribution: 'Himawari-9 &copy; JMA via <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>',
};

export const OPEN_METEO_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${VOLCANO.lat}&longitude=${VOLCANO.lon}` +
  "&hourly=wind_speed_10m,wind_direction_10m,wind_speed_850hPa,wind_direction_850hPa,wind_speed_500hPa,wind_direction_500hPa,wind_speed_250hPa,wind_direction_250hPa" +
  "&forecast_days=2&timezone=UTC";

export const LINKS = {
  magma: "https://magma.esdm.go.id/v1/gunung-api/informasi-letusan",
  bmkg: "https://www.bmkg.go.id/",
  vaac: "http://www.bom.gov.au/aviation/volcanic-ash/",
  brand: "https://niriksagara.id",
};

export const COLORS = {
  navy: "#00253f",
  amber: "#e08a1e",
  purple: "#6d28d9",
  wind: { surface: "#5b6770", low: "#e08a1e", mid: "#c2410c", high: "#6d28d9" },
} as const;
