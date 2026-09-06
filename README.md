# Sebaran Abu Gunung Api

A mobile-first web map that shows where volcanic ash from Indonesia's erupting
volcanoes is now and where it is forecast to be over the next 18 hours. Built
as a free, ad-free public service so people across Indonesia can check the
latest picture and share one link. It started as a Krakatau-only map during
the September 2026 eruption.

Bahasa Indonesia is the default language; English is one tap away.

## What it shows

- Every volcano with an active Darwin Volcanic Ash Advisory Centre (VAAC)
  advisory, plus PVMBG Level III and IV volcanoes as markers. A strip of chips
  in the sheet and the markers on the map select a volcano; the link carries
  the selection as `?g=<code>` (MAGMA VONA code, e.g. `?g=SMR`).
- Ash cloud polygons from the VAAC for the selected volcano: the observed time
  and the +6, +12 and +18 hour forecasts, coloured by altitude band (amber for
  low ash, hatched purple for high ash). Other active volcanoes show their
  current zone as a dashed outline.
- The full advisory in plain words: eruption details, each layer's altitude in
  km, feet and flight level with its movement in km/h and knots, area and
  reach, forecast valid times, the analyst's remarks, the next advisory time
  with an overdue warning, the official Darwin VAAC graphic, the advisory
  history and the original bulletin text. Times use the volcano's own zone
  (WIB, WITA or WIT).
- PVMBG alert level and the latest VONA (Volcano Observatory Notice for
  Aviation) per volcano from MAGMA Indonesia.
- Four satellite views of Himawari-9 behind one control with a menu: daytime
  true colour rendered from the raw 500 m to 1 km visible bands (brown ash and
  its shadow are plain to see; "night" outside daylight); the JMA "Ash RGB"
  composite (possible ash pink, high ice cloud dark, low cloud tan); an
  experimental ash signal (amber where the split-window signal is lifted
  above a clear-sky reference, filtered by cloud tests and by proximity to an
  official zone or volcano, see `docs/superpowers/specs/2026-09-06-ash-signal-design.md`);
  and the clean infrared tiles from NASA GIBS. All refresh every ten minutes
  at the source. The signal is off by default and labelled experimental: thick
  cloud and mountains can trigger it.
- The nearest airports to the selected volcano with their latest METAR
  weather report: whether volcanic ash is reported at the airport, the
  visibility and the report time. With an FAA NOTAM API key configured (see
  Deploy) the card also shows the official closed status from NOTAMs, with
  the closure end time.
- Wind at four heights above the selected crater from Open-Meteo, as a card
  and as arrows on the map showing where ash is heading.
- A "check my location" button that reports the distance to the selected
  volcano and whether the phone's position is inside its forecast ash area.
- Short safety tips and links to the official sources.
- Light and dark themes. The page follows the system setting until the user
  taps the sun/moon button; the choice is remembered on the device. Dark mode
  swaps the Esri World Topo basemap for the Esri Dark Gray Canvas tiles.

## How the data flows

```
scripts/fetch-data.ts  (every 15 min in CI)
  -> the newest bulletin in each of the ten Darwin VAAC product slots from the
     Bureau of Meteorology archive (ftp.bom.gov.au/anon/gen/vaac, read with curl),
     plus the eight files on the NOAA mirror; the newest per volcano wins and a
     lag between the two is noted            (text, parsed in src/lib/vaa-parser.ts,
                                              checked by src/lib/advisory-check.ts)
  -> the matching VAAC graphic per active volcano -> public/data/vag/<code>.png (not committed)
  -> MAGMA Indonesia level table and all-volcano VONA page (HTML, parsed in src/lib/magma-parser.ts)
  -> NASA GIBS capabilities                               (latest Himawari frame time)
  -> aviationweather.gov METARs for the airports in src/lib/airports.ts (parsed in src/lib/metar-parser.ts)
  -> public/data/latest.json  one entry per volcano       (assembled in src/lib/build-latest.ts,
                                                           validated by src/lib/schema.ts)

Volcano identities, MAGMA codes and fallback positions live in
src/lib/volcanoes.ts; an advisory's own position wins when present.

scripts/himawari.py    (every 15 min in CI, Python)
  -> raw Himawari-9 bands 3.9/8.6/10.4/12.4 um from the NOAA open-data bucket,
     the visible bands by day (about 190 MB per scan), plus the same time slot
     on the previous two days as a clear-sky reference
  -> resampled to Web Mercator over 95-131E, 12S-7N at 2 km (satpy, pyresample)
  -> public/data/himawari/true-color.webp, ash-rgb.webp, ash-signal.webp, himawari.json  (not committed)
  -> data/signal-log.jsonl  one line of signal statistics per scan (committed)

browser
  -> reads data/latest.json and data/himawari/himawari.json every 5 min
  -> loads satellite tiles and wind directly (both sources allow CORS)
```

If the Himawari step fails, it records the error in the JSON and keeps the
previous images; the satellite control then skips the affected views.

Every parsed advisory passes sanity checks (coordinates inside a generous box
around the Darwin area, polygon size and distance, layer order, issue time).
A bulletin that fails keeps the previous good one and records why. If both
VAAC sources are down, the script keeps the previous volcano list; if MAGMA is
down it keeps the previous levels, VONAs and Level III markers. Either way it
records the problem in `sourceErrors` and the page shows a small warning
instead of a blank map. The parser is also run against a 45-bulletin sample
from the 2026 archive in the test suite.

## Run it locally

```bash
npm install
npm run fetch     # refresh public/data/latest.json from the live sources
npm run dev       # http://localhost:5173
npm test
npm run build     # static site in dist/
```

The Ash RGB view needs Python 3.12 and a few science packages (about 200 MB):

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/himawari.py  # writes public/data/himawari/, 90 s at night, about 3 min by day
HIMAWARI_CACHE_DIR=/tmp/hsd HIMAWARI_NOW=2026-09-06T05:30:00+00:00 python scripts/himawari.py  # keep downloads, pin the clock
pytest -q                   # Python tests
```

Without this step the site still works; the satellite control simply offers
only the infrared view.

## Deploy

Production runs on Netlify at https://abu-gunung-api.netlify.app (the old
address abu-krakatau.netlify.app redirects there). The GitHub
Actions workflow in `.github/workflows/update-and-deploy.yml` runs on every
push to `main`, every 15 minutes, and on demand. Each run fetches fresh data,
commits it, runs the tests, builds the site and deploys `dist/` to Netlify with
the Netlify CLI. CLI deploys do not use Netlify build minutes.

The workflow needs two repository secrets:

| Secret | Value |
| --- | --- |
| `NETLIFY_SITE_ID` | The site's API ID from the Netlify project settings |
| `NETLIFY_AUTH_TOKEN` | A Netlify personal access token (User settings, Applications) |

GitHub's scheduled trigger proved unreliable (two runs in a day), so a Netlify
scheduled function, `netlify/functions/trigger-refresh.mts`, starts the
workflow every 15 minutes instead. It needs one site environment variable:

| Variable | Value |
| --- | --- |
| `GITHUB_DISPATCH_TOKEN` | A fine-grained GitHub token for this repository with Actions: read and write |

Set it with `npx netlify-cli env:set GITHUB_DISPATCH_TOKEN <token>` or in the
Netlify project settings. Without it the function logs and does nothing.

Two optional secrets switch on airport closure status from NOTAMs. Create a
free account at https://api.faa.gov, register an application with access to
the NOTAM API, then add its credentials:

| Secret | Value |
| --- | --- |
| `FAA_NOTAM_CLIENT_ID` | The application's client id |
| `FAA_NOTAM_CLIENT_SECRET` | The application's client secret |

Without them the fetch step skips NOTAMs and the airports card shows weather
reports only.

To deploy from your own machine instead:

```bash
npx netlify-cli login
npx netlify-cli link          # pick the abu-gunung-api project
npm run fetch && npm run build
npx netlify-cli deploy --prod --dir=dist
```

For a custom domain such as `abu.niriksagara.id`, add the domain in the
Netlify project settings and create the DNS record Netlify shows you.

The build uses a relative base path, so `dist/` also works on any other static
host or under a sub-path of an existing site.

## Data sources and terms

| Source | Use | Terms |
| --- | --- | --- |
| Darwin VAAC (Bureau of Meteorology) via NOAA `tgftp.nws.noaa.gov` | Ash advisories | Public aviation bulletins |
| MAGMA Indonesia (PVMBG, Badan Geologi) | Alert level, VONA | Public information pages |
| NASA GIBS | Himawari-9 imagery | Free, attribution required |
| Open-Meteo | Wind forecast | Free for non-commercial use, attribution required |
| Esri World Topographic Map | Basemap tiles | Free with attribution |

## Disclaimer

The ash areas come from aviation advisories and dispersion models. They are
coarse estimates for aircraft, not measurements of ash on the ground. Always
follow instructions from BPBD, PVMBG and local authorities.

## Licence

MIT. Made as a volunteer effort by [niriksagara.id](https://niriksagara.id).
