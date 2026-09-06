# Krakatau Ash Map: design

Date: 2026-09-06
Status: approved by autonomous /goal directive (no interactive review possible)

## Purpose

A mobile-first, shareable web page that shows where volcanic ash from the
current Anak Krakatau eruption is now and where it is forecast to go over the
next 18 hours. Audience: the general public across Indonesia, on phones, often
on slow networks. Non-commercial. Subtle niriksagara.id credit.

## Assumptions (made without user input)

1. Indonesian (id) is the default language; English (en) is a toggle.
2. Hosting is a static site. GitHub Pages via GitHub Actions is the default
   target; the build uses a relative base path so any static host works
   (for example a subpath or subdomain of niriksagara.id).
3. "Realtime" means: official advisory data refreshed every 15 minutes by a
   scheduled job, plus satellite imagery refreshed every 10 minutes directly
   in the browser. Official ash advisories are only issued every 3 to 6 hours,
   so this cadence loses nothing.
4. No user accounts, no analytics, no crowdsourcing, no backend server.
5. Brand colour from the niriksagara logo: navy `#00253f`.

## Verified data sources (checked 2026-09-06 02:50 UTC)

| Source | What | URL | CORS | Notes |
| --- | --- | --- | --- | --- |
| Darwin VAAC via NOAA mirror | Volcanic Ash Advisory text with observed and +6/+12/+18 h forecast polygons per altitude layer | `https://tgftp.nws.noaa.gov/data/raw/fv/fvau0N.adrm..txt` for N in 01..08 | No | Each file holds the latest bulletin for one header. Krakatau is currently in `fvau04`. Scan all eight and pick advisories whose `VOLCANO:` line contains KRAKATAU. |
| MAGMA Indonesia (PVMBG) | Alert level (Level I-IV) and the latest VONA (Volcano Observatory Notice for Aviation) | `https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas`, `https://magma.esdm.go.id/v1/vona?code=KRA` | No | Returns 403 unless a browser User-Agent header is sent. HTML scraping. |
| NASA GIBS | Himawari-9 Band 13 clean infrared tiles, 10-minute steps | WMTS EPSG:3857, layer `Himawari_AHI_Band13_Clean_Infrared`, TileMatrixSet `GoogleMapsCompatible_Level6`, time `YYYY-MM-DDTHH:MM:00Z` | Yes | Latest time comes from the capabilities XML `Default` value; fall back to "now rounded down to 10 min, minus 30 min". |
| Open-Meteo | Wind speed and direction at 10 m, 850, 500, 250 hPa at the volcano | `https://api.open-meteo.com/v1/forecast` | Yes | Free for non-commercial use. |
| CARTO basemaps | Voyager raster tiles | `https://{s}.basemaps.cartocdn.com/rapid/voyager/{z}/{x}/{y}{r}.png` | Yes | Attribution required. |

The two non-CORS sources are fetched by a script that runs on a schedule and
writes `public/data/latest.json`. The browser only reads that JSON plus the
CORS-enabled sources.

## Approaches considered

1. **Static site + scheduled fetch script (chosen).** GitHub Actions cron
   runs `npm run fetch`, commits `latest.json`, builds, deploys to Pages.
   Free, no server, stale data still serves if a source is down.
2. Cloudflare Worker proxy with a 5-minute cache. Fresher but needs an extra
   account and is a single point of failure.
3. Node server. Overkill for one JSON file.

## Architecture

```
scripts/fetch-data.ts      scheduled job: fetch -> parse -> validate -> write JSON
src/lib/                   pure, tested modules shared by script and browser
  schema.ts                Zod schema for latest.json (single source of truth)
  vaa-parser.ts            VAA text -> Advisory
  magma-parser.ts          MAGMA HTML -> alert level, latest VONA
  flight-level.ts          FL -> metres/feet
  time.ts                  DDHHMMZ + DTG -> ISO, WIB formatting, "x min ago"
  geo.ts                   point-in-polygon, distance (uses @turf)
src/map/                   Leaflet map, ash polygons, satellite overlay, wind
src/ui/                    status card, time chips, layer toggles, location, share
src/i18n.ts                id/en strings
src/main.ts                boot and wiring; polls latest.json every 5 min
public/data/latest.json    generated; the current real advisory is committed
                           so the site works before the first scheduled run
.github/workflows/         update-and-deploy.yml (cron */15, push, manual)
```

Stack: Vite, TypeScript (strict, no `any`), Leaflet 1.9, Zod, @turf
(boolean-point-in-polygon, distance), Vitest, tsx for the script. No UI
framework: one screen, small bundle for slow networks.

## Data model (`latest.json`)

```ts
{
  generatedAt: ISO string,
  volcano: { name, lat, lon, elevationM },
  vaac: null | {
    header, issuedAt: ISO, advisoryNumber, infoSource, eruptionDetails,
    remarks, nextAdvisoryBy: ISO | null,
    observation: { time: ISO, kind: "OBS" | "EST", layers: Layer[] },
    forecasts: { hoursAhead: 6 | 12 | 18, time: ISO, layers: Layer[] }[],
    raw: string
  },
  magma: null | {
    fetchedAt: ISO,
    activityLevel: { level: 1 | 2 | 3 | 4, name: string } | null,
    latestVona: { time: ISO, colorCode, title, text, url } | null
  },
  sourceErrors: string[]
}
Layer = {
  baseFl: number,            // 0 for SFC
  topFl: number,
  polygon: [lon, lat][],     // closed ring not required; UI closes it
  movement: { direction: string, speedKt: number } | null
}
```

`vaac: null` means no current Krakatau advisory was found in any file. The
UI then shows "no active ash advisory" rather than an empty map.

## Fetch script behaviour

1. Download all eight `fvau` files in parallel with a 20 s timeout each.
2. Split each file into advisories on lines matching `^FVAU\d\d ADRM`.
3. Parse each; keep those whose volcano name contains KRAKATAU; pick the one
   with the latest `DTG`.
4. Fetch MAGMA pages with a browser User-Agent. Parse level and latest VONA.
5. Any source failure is recorded in `sourceErrors` and does not abort the
   run, except: if VAAC fetching fails entirely and an existing
   `latest.json` has a `vaac` block, keep the existing block and add an error.
   This prevents a transient NOAA outage from erasing the ash map.
6. Validate the result with the Zod schema; write pretty JSON. Exit non-zero
   only on schema failure or when every source failed.

## VAA parser rules

- Fields are `KEY: value` at column 0; continuation lines start with
  whitespace and are joined with a single space.
- `OBS VA CLD` or `EST VA CLD` gives the observation. `FCST VA CLD +N HR`
  gives forecasts.
- A cloud field starts with `DD/HHMMZ` (forecasts only) then one or more
  layers. A layer is `SFC/FLnnn` or `FLnnn/FLnnn`, followed by coordinates
  `[NS]DDMM [EW]DDDMM` separated by ` - `, optionally followed by
  `MOV <dir> <speed>KT`.
- `VA NOT IDENTIFIABLE`, `NO VA EXP`, or no coordinates gives zero layers.
- Coordinates are degrees and minutes; convert to decimal with sign.
- Observation times (`DD/HHMMZ`) take month and year from `DTG`; if the day
  is greater than the DTG day, use the previous month (month rollover).
- `DTG: YYYYMMDD/HHMMZ` gives `issuedAt`.
- Unknown or malformed fields are ignored, not fatal; a missing `DTG` or
  volcano name is fatal for that advisory (it is skipped with an error).

## UI

Single screen, portrait-first.

- **Map** fills the screen. Basemap CARTO Voyager. Volcano marker with a
  pulsing ring. Ash polygons for the selected time step, one colour per
  altitude band: low (top below FL250) amber, high (FL250 and above) purple,
  semi-transparent with a solid outline. Tap a polygon for altitude in km,
  direction, and speed.
- **Top bar**: title "Sebaran Abu Krakatau", freshness pill ("diperbarui 12
  mnt lalu"; turns amber after 3 h, red after 12 h), language toggle.
- **Time chips** above the sheet: Sekarang, +6 j, +12 j, +18 j, with the
  actual WIB time under each. A small play button cycles them every 1.5 s.
- **Layer toggles** (icon buttons on the map): satellite infrared on/off,
  wind on/off. Satellite shows the timestamp of the frame in use.
- **Bottom sheet** (collapsed by default to one line, drag or tap to expand):
  1. Status: PVMBG alert level badge, VONA colour code, ash top height
     (km and ft), advisory number and issue time, next advisory time.
  2. Wind at four heights, as direction arrows with km/h.
  3. "Cek lokasi saya": uses geolocation, reports distance to the volcano
     and whether the point is inside any polygon of the selected time step.
     Wording makes clear this is a coarse forecast, not a measurement.
  4. Short safety tips and official links (MAGMA, BMKG, VAAC Darwin).
  5. Share button (Web Share API, falls back to copy link).
  6. Footer: "Dibuat secara sukarela oleh niriksagara.id" with the small
     logo, muted, plus data attribution.
- Colours: brand navy `#00253f` for chrome, ash amber `#e08a1e` and plume
  purple `#6d28d9` for data, off-white background. WCAG AA contrast.
- Meta: Open Graph title/description/image, theme-color, web manifest for
  add-to-home-screen. No service worker (avoid stale realtime data).

## Error handling

- `latest.json` unreachable: show a full-width error banner with retry; keep
  the map usable.
- `sourceErrors` non-empty: show a small warning line under the status.
- Satellite capabilities fetch fails: use the computed fallback time; if a
  tile 404s, Leaflet shows nothing (no crash).
- Open-Meteo fails: wind card shows "tidak tersedia".
- Geolocation denied: show a message; no retry loop.

## Testing

- `vaa-parser`: core. Unit tests with real fixtures (Krakatau 2026/183 with
  two layers per step, Semeru EST advisory) and synthetic edge cases: not
  identifiable, no VA expected, FL/FL layers, month rollover, missing DTG,
  northern/western hemisphere coordinates, multiple advisories in one file.
- `magma-parser`: core. Fixture snippets for level table and VONA list;
  missing Krakatau row; no VONA entries.
- `time`, `flight-level`, `geo`: small unit tests.
- `schema`: rejects malformed JSON, accepts the committed `latest.json`.
- `fetch-data`: the "keep previous vaac on total failure" rule is tested by
  extracting it into a pure `mergeWithPrevious` function.
- UI: peripheral; a build and a manual browser check (screenshot) only.

## Out of scope

Historic playback beyond the current advisory, crowdsourced ashfall reports,
push notifications, offline mode, other volcanoes.
