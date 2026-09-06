# Himawari-9 Ash RGB layer

Date: 2026-09-06

## Goal

Show real per-pixel satellite data with a gradient, at 2 km and every 10
minutes, so people can see the fine structure of the ash cloud that the coarse
VAAC polygons cannot show. The product is the standard JMA "Ash RGB"
composite, which ash analysts use. Ash appears pink to magenta, ice cloud dark,
low cloud and the surface pale tan to cyan.

An ash-only gradient was tested and rejected: in the humid tropics the
split-window signal stays positive, and a local-anomaly index flagged cloud
edges and the mountains of Sumatra and Java as strongly as the real plume.

## Data

Raw Himawari-9 AHI level 1b files from the NOAA open data bucket
`noaa-himawari9` on Amazon S3 (public, no account). For each 10 minute
full-disk scan the pipeline downloads bands B11 (8.6 um), B13 (10.4 um) and
B15 (12.4 um) at 2 km for segments 6 and 7, which cover latitude 0 to about
-20 degrees at our longitude. About 17 MB per scan, published roughly 12
minutes after scan time.

## Pipeline

`scripts/ash_rgb.py`, Python 3.12, runs in the GitHub Actions workflow before
the site build:

1. List the bucket for the current and previous UTC hour, pick the newest scan
   that has all six files.
2. If the output JSON already has that scan time, exit.
3. Download to a temporary directory; load with satpy (`ahi_hsd` reader) as
   brightness temperature; resample with pyresample to a Web Mercator grid
   covering longitude 99 to 113 and latitude -13 to 0 at 2 km.
4. Compose the Ash RGB: red = B15 - B13 scaled -4..2 K, green = B13 - B11
   scaled -4..5 K, blue = B13 scaled 243..303 K. Alpha 0 where data is
   missing.
5. Write `public/data/himawari/ash-rgb.webp` (lossy WebP, about 50 KB) and `ash-rgb.json`
   (scan time, generated time, bounds, size, image name, source).
6. On any failure write the error into the JSON, keep the previous image, and
   exit 0 so the deploy still runs.

The outputs are build artifacts, not committed to git.

## Site

- The satellite control cycles: off, Ash RGB, infrared. A small tag next to
  the control names the active mode.
- The Ash RGB is a Leaflet image overlay in the satellite pane, so it sits
  under the VAAC polygons.
- When the Ash RGB is on, the legend shows three swatches (possible ash, high
  ice cloud, low cloud / surface) and the scan time in WIB.
- The JSON is validated with zod. If it is missing or carries an error, the
  cycle skips the Ash RGB mode and the control title says it is unavailable.

## Testing

- Python: pytest for scan selection, band scaling and the Mercator extent.
- TypeScript: zod schema test for the JSON.
- Manual: preview in a headless browser at phone and desktop sizes.
