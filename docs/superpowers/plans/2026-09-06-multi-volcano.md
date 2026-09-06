# Multi-volcano plan

1. Data layer (tests first)
   - `volcanoes.ts` table and `resolveVolcano(vaacName)`.
   - Parser: position and elevation from PSN / SOURCE ELEV; `isTerminated`.
   - MAGMA: `parseVonas(html)` for all volcanoes; level lookup by MAGMA name.
   - Schema v2 and `buildLatest` v2; fetch script.
   - Front end reads v2; single-volcano behaviour preserved with the first entry.
2. Selection UI
   - Volcano strip in the sheet peek; markers for all; selection state with
     `?g=` in the URL; wind per volcano; location check per volcano.
   - Copy: new title and strings in both languages.
3. Nationwide satellite region (ash_rgb.py bounds and segments 4-8).
4. Experimental ash detector (separate design note).
