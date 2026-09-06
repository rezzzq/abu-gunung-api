# All erupting volcanoes in Indonesia

Date: 2026-09-06. Approved defaults: name "Sebaran Abu Gunung Api"; show every
volcano with an active Darwin VAAC advisory plus PVMBG Level III and IV
volcanoes as plain markers; open on the volcano with the highest ash top.

## Data (public/data/latest.json, version 2)

```
{
  generatedAt, sourceErrors[], satellite,
  volcanoes: [ {
    id,            MAGMA VONA code (KRA, SMR, ...) or the VAAC name when unknown
    name,          display name ("Anak Krakatau")
    gvp,           Smithsonian number from the advisory, or null
    lat, lon, elevationM,   from the advisory PSN / SOURCE ELEV, else the table
    region,        short place label from the table, or null
    vaac,          newest advisory for this volcano, or null
    active,        true when that advisory is fresh (< 24 h) and not terminated
    activityLevel, latestVona          from MAGMA, or null
  } ]
}
```

- `src/lib/volcanoes.ts` holds a small table: VAAC name, MAGMA name and code,
  position, elevation, region. Volcanoes with an advisory but no table entry
  still appear, positioned from the advisory.
- Order: active volcanoes first by highest ash top, then Level III/IV
  volcanoes by level. The first entry is the default selection.
- A terminated advisory ("NO FURTHER ADVISORIES") or one older than 24 hours
  does not make a volcano active. Ash zones come only from active advisories.
- The advisory parser also returns the position and elevation from the
  bulletin. MAGMA VONAs come from the all-volcano VONA page in one fetch.
- Keep-previous rule per volcano: if the VAAC fetch fails, keep the previous
  volcano list; if MAGMA fails, keep previous levels and VONAs.

## Map and sheet

- One marker per listed volcano. The selected one carries the pulsing ring;
  the others are small dots coloured by PVMBG level.
- The sheet peek gains a volcano strip above the time control: one chip per
  volcano with a level dot. Tapping a chip or a marker selects that volcano.
- Selection drives: map view (fit to the observed zones, max zoom 8), time
  steps and polygons, status headline and detail card, wind (fetched per
  volcano, cached), location check, share link (`?g=<id>`).
- Other volcanoes' current zones draw as thin outlines only.
- Title: "Sebaran Abu Gunung Api" / "Indonesia Volcanic Ash Map". The topbar
  freshness line stays.

## Satellite

- The Ash RGB region grows to all of Indonesia (95 to 131 E, 12 S to 7 N).
- The experimental ash detector follows the same region, off by default.

## Out of scope for now

New OG image and custom domain; ashfall (ground) reports.
