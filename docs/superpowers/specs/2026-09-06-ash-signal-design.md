# Experimental satellite ash signal

Date: 2026-09-06. Off by default; labelled experimental; to be compared with
the VAAC zones daily for a week before any wider use.

## Why the simple filter failed

In the humid tropics the 12.4 minus 10.4 micron difference (the classic ash
signal) never turns negative for thin ash. It only lifts a little above its
surroundings. Mountain tops (less water vapour above them) and cloud tops
lift it as much. A fixed threshold or a spatial background marks them all.

## Method (scripts/himawari.py, same run as the Ash RGB)

1. Current scan: bands B07 (3.9 um), B11 (8.6), B13 (10.4), B15 (12.4) for
   segments 5-7, resampled to the Indonesia grid.
2. Clear-sky reference: the same time slot from the previous two days, bands
   B13 and B15 only. Per pixel, the reference is the minimum of B15-B13 over
   those days: clouds raise the value, so the minimum is the clearest look.
   This removes the fixed terrain and moisture pattern. A pixel cloudy on both
   days gets a high reference and can only be missed, not falsely flagged.
3. Lift = (B15-B13 now) - reference. Index ramps from 0 at 1.2 K to 1 at 3 K.
4. Rejections: ice cloud when B11-B13 > -0.5 K; reflective water cloud by day
   when B07-B13 > 12 K; low water cloud at night when B07-B13 < -2.5 K
   (day/night from the solar zenith angle). Then a 3x3 median and blobs under
   six pixels are dropped.
5. Source check: a blob is kept only if it touches an active VAAC zone
   (observed or forecast, widened by about 25 km) or lies within 150 km of an
   active volcano. Blobs far from any source are counted but not shown.
6. Output: `ash-signal.webp` (amber, alpha = index) and a `signal` block in
   `himawari.json` with the scan time, reference days, and statistics
   (candidate pixels, kept pixels, blobs kept and rejected, share inside a
   VAAC zone). The statistics are the daily evaluation record.

## Site

The satellite control cycles off, Ash RGB, ash signal, infrared. The signal
legend shows an amber gradient, "experimental", the scan time and a one-line
caveat that thick cloud and mountains can trigger it.

## Known limits

Fresh eruption columns are ice-coated and fail the ice test. Ash under
weather cloud is invisible. Two reference days can both be cloudy. None of the
statistics prove correctness; they only measure agreement with the VAAC.
