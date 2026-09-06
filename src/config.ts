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

/** Whole archipelago while the data loads; the map then focuses on the selected volcano. */
export const INITIAL_VIEW = { center: [-4.5, 116] as [number, number], zoom: 5 };
/** Zoom used when focusing a volcano; fitting its ash zones never zooms in further. */
export const FOCUS_MAX_ZOOM = 8;

/** Esri tile services need no API key. Light: World Topo. Dark: Dark Gray Canvas base plus its label layer. */
export const BASEMAP = {
  light: {
    layers: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"],
    attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS',
    maxZoom: 19,
  },
  dark: {
    layers: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, OpenStreetMap contributors',
    maxZoom: 16,
  },
} as const;

export const SATELLITE = {
  layer: "Himawari_AHI_Band13_Clean_Infrared",
  // "default" as the time selects the newest available 10-minute frame.
  url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Himawari_AHI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
  maxNativeZoom: 6,
  attribution: 'Himawari-9 &copy; JMA via <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>',
  rgbAttribution: 'Himawari-9 &copy; JMA via <a href="https://registry.opendata.aws/noaa-himawari/">NOAA Open Data</a>',
};

/** Sidecar for the images rendered by scripts/himawari.py; absent when the pipeline has not run. */
export const HIMAWARI_URL = `${import.meta.env.BASE_URL}data/himawari/himawari.json`;
/** An Ash RGB scan older than this is flagged as stale in the legend. */
export const RGB_STALE_MIN = 90;

export function openMeteoUrl(lat: number, lon: number): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    "&hourly=wind_speed_10m,wind_direction_10m,wind_speed_850hPa,wind_direction_850hPa,wind_speed_500hPa,wind_direction_500hPa,wind_speed_250hPa,wind_direction_250hPa" +
    "&forecast_days=2&timezone=UTC"
  );
}

export const LINKS = {
  /** Operator of the large Indonesian airports and the civil aviation authority: official announcements. */
  airportsOperator: "https://injourneyairports.id/",
  dgca: "https://hubud.dephub.go.id/",
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
