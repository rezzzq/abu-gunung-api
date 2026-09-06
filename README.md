# Sebaran Abu Krakatau

A mobile-first web map that shows where volcanic ash from Anak Krakatau is now
and where it is forecast to be over the next 18 hours. Built as a free,
ad-free public service so people across Indonesia can check the latest picture
and share one link.

Bahasa Indonesia is the default language; English is one tap away.

## What it shows

- Ash cloud polygons from the Darwin Volcanic Ash Advisory Centre (VAAC) for
  the observed time and the +6, +12 and +18 hour forecasts, coloured by
  altitude band (amber for low ash, hatched purple for high ash).
- PVMBG alert level and the latest VONA (Volcano Observatory Notice for
  Aviation) from MAGMA Indonesia.
- Himawari-9 infrared satellite imagery from NASA GIBS, refreshed every ten
  minutes, as a toggle.
- Wind at four heights above the crater from Open-Meteo, as a card and as
  arrows on the map showing where ash is heading.
- A "check my location" button that reports the distance to the crater and
  whether the phone's position is inside the forecast ash area.
- Short safety tips and links to the official sources.
- An animated smoke plume on the crater that drifts the way the highest
  available wind is carrying the ash. It is hidden when no advisory is active
  and when the device asks for reduced motion.
- Light and dark themes. The page follows the system setting until the user
  taps the sun/moon button; the choice is remembered on the device. Dark mode
  swaps the Esri World Topo basemap for the Esri Dark Gray Canvas tiles.

## How the data flows

```
scripts/fetch-data.ts  (every 15 min in CI)
  -> Darwin VAAC bulletins via the NOAA mirror  (text, parsed in src/lib/vaa-parser.ts)
  -> MAGMA Indonesia pages                      (HTML, parsed in src/lib/magma-parser.ts)
  -> NASA GIBS capabilities                     (latest Himawari frame time)
  -> public/data/latest.json                    (validated by src/lib/schema.ts)

browser
  -> reads data/latest.json every 5 min
  -> loads satellite tiles and wind directly (both sources allow CORS)
```

If a source is down, the script keeps the previous advisory and records the
problem in `sourceErrors`; the page shows a small warning instead of a blank
map.

## Run it locally

```bash
npm install
npm run fetch     # refresh public/data/latest.json from the live sources
npm run dev       # http://localhost:5173
npm test
npm run build     # static site in dist/
```

## Deploy

Production runs on Netlify at https://abu-krakatau.netlify.app. The GitHub
Actions workflow in `.github/workflows/update-and-deploy.yml` runs on every
push to `main`, every 15 minutes, and on demand. Each run fetches fresh data,
commits it, runs the tests, builds the site and deploys `dist/` to Netlify with
the Netlify CLI. CLI deploys do not use Netlify build minutes.

The workflow needs two repository secrets:

| Secret | Value |
| --- | --- |
| `NETLIFY_SITE_ID` | The site's API ID from the Netlify project settings |
| `NETLIFY_AUTH_TOKEN` | A Netlify personal access token (User settings, Applications) |

To deploy from your own machine instead:

```bash
npx netlify-cli login
npx netlify-cli link          # pick the abu-krakatau project
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
