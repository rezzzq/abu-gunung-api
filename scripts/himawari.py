"""Himawari-9 products for the ash map: the JMA Ash RGB and an experimental ash signal.

Downloads the latest raw AHI scan from the NOAA open-data bucket, resamples it
to a Web Mercator grid over Indonesia and writes:

- ``ash-rgb.webp``     the JMA Ash RGB composite (ash pink, ice cloud dark, low cloud tan)
- ``ash-signal.webp``  amber where the split-window ash signal is lifted above a
                       clear-sky reference from the previous days, filtered by
                       cloud tests and by proximity to an active VAAC zone or volcano
- ``himawari.json``    scan time, bounds, per-product status and the signal statistics

Run from the repository root: ``python scripts/himawari.py``.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import math
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request
import warnings
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np

BUCKET = "https://noaa-himawari9.s3.amazonaws.com"
PREFIX = "AHI-L1b-FLDK"
RGB_BANDS = ("B11", "B13", "B15")
# 3.9 um joins for the day/night water-cloud tests of the ash signal.
SCAN_BANDS = ("B07", "B11", "B13", "B15")
REFERENCE_BANDS = ("B13", "B15")
REFERENCE_DAYS = 2
# Full-disk segments 5-7 cover about 10 N to 20 S at Indonesian longitudes.
SEGMENTS = ("S0510", "S0610", "S0710")
FILE_RE = re.compile(
    r"HS_H09_(?P<date>\d{8})_(?P<time>\d{4})_(?P<band>B\d{2})_FLDK_R20_(?P<segment>S\d{4})\.DAT\.bz2$"
)

# Longitude 95..131 E and latitude 12 S..7 N at about 2 km: Sumatra to Halmahera, all listed volcanoes.
REGION = {"west": 95.0, "south": -12.0, "east": 131.0, "north": 7.0}
RESOLUTION_M = 2000.0
EARTH_RADIUS_M = 6378137.0

# Ash signal tuning, in kelvin unless noted.
LIFT_LOW = 1.8
LIFT_HIGH = 3.5
ICE_TEST = -0.5  # B11 - B13 above this reads as ice cloud
DAY_WATER_TEST = 12.0  # B07 - B13 above this by day reads as reflective water cloud
NIGHT_WATER_TEST = -2.5  # B07 - B13 below this at night reads as low water cloud
MIN_BLOB_PX = 6
MIN_INDEX = 0.25
ZONE_DILATE_PX = 12  # about 25 km
NEAR_VOLCANO_KM = 150.0
# A blob that only qualifies by being near a volcano must be small: a real large plume has a VAAC zone.
MAX_NEAR_ONLY_PX = 300

OUT_DIR = Path("public/data/himawari")
LATEST_JSON = Path("public/data/latest.json")
# One line per rendered scan, committed by the workflow: the record for the weekly evaluation.
SIGNAL_LOG = Path("data/signal-log.jsonl")
RGB_IMAGE = "ash-rgb.webp"
SIGNAL_IMAGE = "ash-signal.webp"
JSON_NAME = "himawari.json"
SOURCE = "Himawari-9 AHI via NOAA Open Data"

log = logging.getLogger("himawari")


# ---------------------------------------------------------------- bucket access


def list_keys(prefix: str, timeout: float = 60.0) -> list[str]:
    """Object keys under a prefix, using the public S3 list API (one page covers an hour)."""
    url = f"{BUCKET}/?list-type=2&prefix={prefix}&max-keys=1000"
    with urllib.request.urlopen(url, timeout=timeout) as res:
        root = ET.fromstring(res.read())
    ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
    return [el.text for el in root.findall("s3:Contents/s3:Key", ns) if el.text]


def complete_scans(keys: list[str], bands: tuple[str, ...]) -> dict[str, list[str]]:
    """Scan stamp (YYYYMMDDHHMM) -> keys, for scans that have every band and segment."""
    scans: dict[str, dict[tuple[str, str], str]] = {}
    for key in keys:
        m = FILE_RE.search(key)
        if not m or m["band"] not in bands or m["segment"] not in SEGMENTS:
            continue
        scans.setdefault(m["date"] + m["time"], {})[(m["band"], m["segment"])] = key
    needed = len(bands) * len(SEGMENTS)
    return {stamp: sorted(files.values()) for stamp, files in scans.items() if len(files) == needed}


def stamp_to_iso(stamp: str) -> str:
    when = dt.datetime.strptime(stamp, "%Y%m%d%H%M").replace(tzinfo=dt.UTC)
    return when.strftime("%Y-%m-%dT%H:%M:%SZ")


def pick_latest_scan(keys: list[str], bands: tuple[str, ...] = RGB_BANDS) -> tuple[str, list[str]] | None:
    """Newest scan that has every band and segment we need; returns its ISO time and the keys."""
    scans = complete_scans(keys, bands)
    if not scans:
        return None
    stamp = max(scans)
    return stamp_to_iso(stamp), scans[stamp]


def find_latest_scan(now: dt.datetime, bands: tuple[str, ...]) -> tuple[str, str, list[str]] | None:
    """Looks at the current and the previous UTC hour, newest first. Returns (stamp, iso, keys)."""
    for hour in (now, now - dt.timedelta(hours=1)):
        scans = complete_scans(list_keys(f"{PREFIX}/{hour:%Y/%m/%d}/{hour:%H}"), bands)
        if scans:
            stamp = max(scans)
            return stamp, stamp_to_iso(stamp), scans[stamp]
    return None


def find_reference_scans(stamp: str, days: int = REFERENCE_DAYS) -> list[tuple[str, list[str]]]:
    """Same time slot on the previous days, B13 and B15 only. Missing days are skipped."""
    when = dt.datetime.strptime(stamp, "%Y%m%d%H%M").replace(tzinfo=dt.UTC)
    found: list[tuple[str, list[str]]] = []
    for back in range(1, days + 1):
        ref = when - dt.timedelta(days=back)
        prefix = f"{PREFIX}/{ref:%Y/%m/%d}/{ref:%H%M}/"
        try:
            scans = complete_scans(list_keys(prefix), REFERENCE_BANDS)
        except (urllib.error.URLError, ET.ParseError) as exc:
            log.warning("reference %s unavailable: %s", ref.date(), exc)
            continue
        key = ref.strftime("%Y%m%d%H%M")
        if key in scans:
            found.append((ref.strftime("%Y-%m-%d"), scans[key]))
    return found


def download(keys: list[str], into: Path) -> list[Path]:
    """Fetches the files; with HIMAWARI_CACHE_DIR set, keeps them there between runs for local work."""
    cache = os.environ.get("HIMAWARI_CACHE_DIR")
    paths: list[Path] = []
    for key in keys:
        dest = (Path(cache) if cache else into) / Path(key).name
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(f"{BUCKET}/{key}", dest)
        paths.append(dest)
    log.info("downloaded %d files (%d MB)", len(paths), sum(p.stat().st_size for p in paths) // 1_000_000)
    return paths


# ---------------------------------------------------------------- geometry


def mercator_extent(
    west: float, south: float, east: float, north: float, resolution_m: float
) -> tuple[tuple[float, float, float, float], tuple[int, int]]:
    """Web Mercator (EPSG:3857) extent in metres and the grid size for a lon/lat box."""

    def project(lon: float, lat: float) -> tuple[float, float]:
        x = math.radians(lon) * EARTH_RADIUS_M
        y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * EARTH_RADIUS_M
        return x, y

    x0, y0 = project(west, south)
    x1, y1 = project(east, north)
    width = int(round((x1 - x0) / resolution_m))
    height = int(round((y1 - y0) / resolution_m))
    return (x0, y0, x1, y1), (width, height)


def grid_latlon(width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    """Latitude and longitude of every grid cell centre."""
    (x0, y0, x1, y1), _ = mercator_extent(resolution_m=RESOLUTION_M, **REGION)
    xs = x0 + (np.arange(width) + 0.5) * (x1 - x0) / width
    ys = y1 - (np.arange(height) + 0.5) * (y1 - y0) / height
    lons = np.degrees(xs / EARTH_RADIUS_M)
    lats = np.degrees(2 * np.arctan(np.exp(ys / EARTH_RADIUS_M)) - math.pi / 2)
    return np.meshgrid(lats, lons, indexing="ij")


def grid_xy(lon: float, lat: float, width: int, height: int) -> tuple[float, float]:
    """Grid column and row (fractional) for a lon/lat."""
    (x0, y0, x1, y1), _ = mercator_extent(resolution_m=RESOLUTION_M, **REGION)
    x = math.radians(lon) * EARTH_RADIUS_M
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * EARTH_RADIUS_M
    return (x - x0) / (x1 - x0) * width, (y1 - y) / (y1 - y0) * height


# ---------------------------------------------------------------- products


def scale_band(data: np.ndarray, low: float, high: float) -> np.ndarray:
    """Linear stretch to 0..1 with clipping; missing values become 0."""
    scaled = (data - low) / (high - low)
    return np.clip(np.nan_to_num(scaled, nan=0.0), 0.0, 1.0)


def compose_rgb(b11: np.ndarray, b13: np.ndarray, b15: np.ndarray) -> np.ndarray:
    """JMA Ash RGB: red = B15-B13 (-4..2 K), green = B13-B11 (-4..5 K), blue = B13 (243..303 K)."""
    red = scale_band(b15 - b13, -4.0, 2.0)
    green = scale_band(b13 - b11, -4.0, 5.0)
    blue = scale_band(b13, 243.0, 303.0)
    valid = np.isfinite(b11) & np.isfinite(b13) & np.isfinite(b15)
    rgba = np.dstack([red, green, blue, valid.astype(float)])
    return np.round(rgba * 255).astype(np.uint8)


def clear_sky_reference(split_windows: list[np.ndarray]) -> np.ndarray:
    """Per-pixel minimum of B15-B13 over the reference days.

    Clouds only raise the value, so the minimum is the clearest look at each pixel.
    """
    stack = np.stack(split_windows)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        return np.nanmin(stack, axis=0)


def lift_index(
    s_now: np.ndarray, reference: np.ndarray, low: float = LIFT_LOW, high: float = LIFT_HIGH
) -> np.ndarray:
    """0..1 as the current split-window value rises above the reference; missing data gives 0."""
    lift = s_now - reference
    return np.clip(np.nan_to_num((lift - low) / (high - low), nan=0.0), 0.0, 1.0)


def keep_near_sources(
    index: np.ndarray,
    zone_mask: np.ndarray,
    near_mask: np.ndarray,
    min_index: float = MIN_INDEX,
    max_near_only_px: int = MAX_NEAR_ONLY_PX,
) -> tuple[np.ndarray, dict[str, int]]:
    """Keeps blobs that touch a VAAC zone, or small blobs that lie near an active volcano."""
    from scipy import ndimage

    labels, count = ndimage.label(index > min_index)
    kept = np.zeros_like(index)
    stats = {"blobsKept": 0, "blobsRejected": 0}
    for blob in range(1, count + 1):
        cells = labels == blob
        in_zone = bool(np.any(zone_mask & cells))
        near_small = bool(np.any(near_mask & cells)) and int(np.count_nonzero(cells)) <= max_near_only_px
        if in_zone or near_small:
            kept[cells] = index[cells]
            stats["blobsKept"] += 1
        else:
            stats["blobsRejected"] += 1
    return kept, stats


def signal_index(
    bands: dict[str, np.ndarray],
    reference: np.ndarray,
    solar_zenith: np.ndarray,
) -> np.ndarray:
    """Candidate ash index before the source check: lift above clear sky, minus ice and water cloud."""
    from scipy import ndimage

    s_now = bands["B15"] - bands["B13"]
    index = lift_index(s_now, reference)
    valid = np.isfinite(s_now) & np.isfinite(bands["B11"]) & np.isfinite(bands["B07"])
    ice = (bands["B11"] - bands["B13"]) > ICE_TEST
    shortwave = bands["B07"] - bands["B13"]
    day = solar_zenith < 85.0
    # Twilight gets the night test: the small solar term at 3.9 um still leaves low cloud well negative.
    water = (day & (shortwave > DAY_WATER_TEST)) | (~day & (shortwave < NIGHT_WATER_TEST))
    index[~valid | ice | water] = 0.0
    index = ndimage.median_filter(index, size=3)
    labels, count = ndimage.label(index > MIN_INDEX)
    if count:
        sizes = ndimage.sum(np.ones_like(labels), labels, index=np.arange(1, count + 1))
        small = np.isin(labels, np.flatnonzero(sizes < MIN_BLOB_PX) + 1)
        index[small] = 0.0
    return index


def source_masks(volcanoes: list[dict], width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    """Rasterised active VAAC zones (widened) and the area within NEAR_VOLCANO_KM of an active volcano."""
    from PIL import Image, ImageDraw
    from scipy import ndimage

    zones = Image.new("1", (width, height), 0)
    draw = ImageDraw.Draw(zones)
    lat_grid, lon_grid = grid_latlon(width, height)
    near = np.zeros((height, width), dtype=bool)
    for v in volcanoes:
        if not v.get("active") or not v.get("vaac"):
            continue
        adv = v["vaac"]
        layers = list((adv.get("observation") or {}).get("layers", []))
        for forecast in adv.get("forecasts", []):
            layers.extend(forecast.get("layers", []))
        for layer in layers:
            ring = [grid_xy(lon, lat, width, height) for lon, lat in layer["polygon"]]
            if len(ring) >= 3:
                draw.polygon(ring, fill=1)
        dist = haversine_km(lat_grid, lon_grid, float(v["lat"]), float(v["lon"]))
        near |= dist <= NEAR_VOLCANO_KM
    zone = np.array(zones, dtype=bool)
    if zone.any():
        zone = ndimage.binary_dilation(zone, iterations=ZONE_DILATE_PX)
    return zone, near


def haversine_km(lat_grid: np.ndarray, lon_grid: np.ndarray, lat: float, lon: float) -> np.ndarray:
    phi1 = np.radians(lat_grid)
    phi2 = math.radians(lat)
    dphi = phi2 - phi1
    dlam = np.radians(lon - lon_grid)
    a = np.sin(dphi / 2) ** 2 + np.cos(phi1) * math.cos(phi2) * np.sin(dlam / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))


def render_bands(files: list[Path], bands: tuple[str, ...]) -> dict[str, np.ndarray]:
    """Loads a scan with satpy and resamples the bands to the region grid as brightness temperatures."""
    from pyresample.geometry import AreaDefinition
    from satpy import Scene

    extent, (width, height) = mercator_extent(resolution_m=RESOLUTION_M, **REGION)
    area = AreaDefinition("indonesia", "Indonesia", "indonesia", "EPSG:3857", width, height, extent)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        scene = Scene(reader="ahi_hsd", filenames=[str(f) for f in files])
        scene.load(list(bands), calibration="brightness_temperature")
        local = scene.resample(area, resampler="nearest", radius_of_influence=6000)
        return {name: np.asarray(local[name].values, dtype=np.float64) for name in bands}


def solar_zenith(width: int, height: int, when: dt.datetime) -> np.ndarray:
    from pyorbital.astronomy import sun_zenith_angle

    lat_grid, lon_grid = grid_latlon(width, height)
    return np.asarray(sun_zenith_angle(when, lon_grid, lat_grid), dtype=np.float64)


def read_volcanoes() -> list[dict]:
    """Active volcanoes and their zones from the advisory document; empty when it is missing or invalid."""
    try:
        data = json.loads(LATEST_JSON.read_text())
        return [v for v in data.get("volcanoes", []) if isinstance(v, dict)]
    except (OSError, json.JSONDecodeError) as exc:
        log.warning("latest.json unavailable, no source check possible: %s", exc)
        return []


# ---------------------------------------------------------------- output


def save_webp(rgba: np.ndarray, path: Path) -> None:
    from PIL import Image

    # Lossy WebP keeps the smooth gradients and is about 15 times smaller than PNG.
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", quality=85, method=6)


def signal_rgba(index: np.ndarray) -> np.ndarray:
    rgba = np.zeros((*index.shape, 4), dtype=np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = 224, 138, 30
    rgba[..., 3] = np.round(np.clip(index, 0, 1) * 235).astype(np.uint8)
    return rgba


def now_iso() -> str:
    return dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_previous(out_dir: Path) -> dict | None:
    path = out_dir / JSON_NAME
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


def write_json(out_dir: Path, meta: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / JSON_NAME).write_text(json.dumps(meta, indent=2) + "\n")


def append_signal_log(meta: dict) -> None:
    """Appends the scan's signal statistics so the week of evaluation has a record."""
    SIGNAL_LOG.parent.mkdir(parents=True, exist_ok=True)
    line = {
        "scanTime": meta.get("scanTime"),
        "generatedAt": meta.get("generatedAt"),
        "referenceDays": meta["signal"].get("referenceDays"),
        "stats": meta["signal"].get("stats"),
        "error": meta["signal"].get("error"),
    }
    with SIGNAL_LOG.open("a") as f:
        f.write(json.dumps(line, separators=(",", ":")) + "\n")


def base_meta(previous: dict | None) -> dict:
    return {
        "generatedAt": now_iso(),
        "scanTime": (previous or {}).get("scanTime"),
        "bounds": REGION,
        "width": (previous or {}).get("width"),
        "height": (previous or {}).get("height"),
        "source": SOURCE,
        "rgb": (previous or {}).get("rgb") or {"image": None, "error": None},
        "signal": (previous or {}).get("signal")
        or {"image": None, "error": None, "referenceDays": [], "stats": None},
    }


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logging.getLogger("satpy").setLevel(logging.WARNING)
    out_dir = OUT_DIR
    previous = read_previous(out_dir)
    meta = base_meta(previous)
    try:
        found = find_latest_scan(dt.datetime.now(dt.UTC), SCAN_BANDS)
        if not found:
            raise RuntimeError("no complete Himawari-9 scan in the last two hours")
        stamp, scan_time, keys = found
        if (
            previous
            and previous.get("scanTime") == scan_time
            and previous.get("rgb", {}).get("error") is None
            and previous.get("signal", {}).get("error") is None
        ):
            log.info("scan %s already rendered", scan_time)
            return 0
        when = dt.datetime.strptime(stamp, "%Y%m%d%H%M").replace(tzinfo=dt.UTC)
        references = find_reference_scans(stamp)
        with tempfile.TemporaryDirectory() as tmp:
            bands = render_bands(download(keys, Path(tmp)), SCAN_BANDS)
            refs: list[np.ndarray] = []
            for day, ref_keys in references:
                ref_dir = Path(tmp) / day
                ref_dir.mkdir()
                ref_bands = render_bands(download(ref_keys, ref_dir), REFERENCE_BANDS)
                refs.append(ref_bands["B15"] - ref_bands["B13"])
        height, width = bands["B13"].shape
        out_dir.mkdir(parents=True, exist_ok=True)
        meta.update({"scanTime": scan_time, "width": width, "height": height})

        save_webp(compose_rgb(bands["B11"], bands["B13"], bands["B15"]), out_dir / RGB_IMAGE)
        meta["rgb"] = {"image": RGB_IMAGE, "error": None}
        log.info("wrote %s for scan %s (%dx%d)", RGB_IMAGE, scan_time, width, height)

        try:
            if not refs:
                raise RuntimeError("no reference scan from the previous days")
            candidate = signal_index(bands, clear_sky_reference(refs), solar_zenith(width, height, when))
            zone, near = source_masks(read_volcanoes(), width, height)
            kept, blob_stats = keep_near_sources(candidate, zone, near)
            save_webp(signal_rgba(kept), out_dir / SIGNAL_IMAGE)
            candidates = int(np.count_nonzero(candidate > MIN_INDEX))
            inside_zone = int(np.count_nonzero((candidate > MIN_INDEX) & zone))
            meta["signal"] = {
                "image": SIGNAL_IMAGE,
                "error": None,
                "referenceDays": [day for day, _ in references],
                "stats": {
                    "candidatePixels": candidates,
                    "candidatesInsideZone": inside_zone,
                    "keptPixels": int(np.count_nonzero(kept > MIN_INDEX)),
                    "maxIndex": round(float(kept.max()), 3),
                    **blob_stats,
                },
            }
            log.info("wrote %s: %s", SIGNAL_IMAGE, meta["signal"]["stats"])
        except Exception as exc:  # noqa: BLE001 - the RGB stays useful when the signal fails
            log.error("ash signal failed: %s", exc)
            meta["signal"] = {
                "image": None,
                "error": f"{type(exc).__name__}: {exc}",
                "referenceDays": [],
                "stats": None,
            }
        write_json(out_dir, meta)
        append_signal_log(meta)
        return 0
    except Exception as exc:  # noqa: BLE001 - any failure must be recorded, the deploy goes on
        log.error("himawari failed: %s", exc)
        meta["rgb"] = {**meta["rgb"], "error": f"{type(exc).__name__}: {exc}"}
        write_json(out_dir, meta)
        return 0


if __name__ == "__main__":
    sys.exit(main())
