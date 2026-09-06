"""Build the Himawari-9 Ash RGB overlay for Indonesia.

Downloads the latest raw AHI scan (bands 8.6, 10.4 and 12.4 um) from the NOAA
open-data bucket, resamples it to a Web Mercator grid and writes the JMA Ash
RGB composite as a PNG plus a JSON sidecar that the site reads.

Run from the repository root: ``python scripts/ash_rgb.py``.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import math
import re
import sys
import tempfile
import urllib.request
import warnings
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np

BUCKET = "https://noaa-himawari9.s3.amazonaws.com"
PREFIX = "AHI-L1b-FLDK"
BANDS = ("B11", "B13", "B15")
# Full-disk segments 5-7 cover about 10 N to 20 S at Indonesian longitudes.
SEGMENTS = ("S0510", "S0610", "S0710")
FILE_RE = re.compile(
    r"HS_H09_(?P<date>\d{8})_(?P<time>\d{4})_(?P<band>B\d{2})_FLDK_R20_(?P<segment>S\d{4})\.DAT\.bz2$"
)

# Longitude 95..131 E and latitude 12 S..7 N at about 2 km: Sumatra to Halmahera, all listed volcanoes.
REGION = {"west": 95.0, "south": -12.0, "east": 131.0, "north": 7.0}
RESOLUTION_M = 2000.0
EARTH_RADIUS_M = 6378137.0

OUT_DIR = Path("public/data/himawari")
IMAGE_NAME = "ash-rgb.webp"
JSON_NAME = "ash-rgb.json"
SOURCE = "Himawari-9 AHI via NOAA Open Data (JMA Ash RGB recipe)"

log = logging.getLogger("ash_rgb")


def list_keys(prefix: str, timeout: float = 60.0) -> list[str]:
    """Object keys under a prefix, using the public S3 list API (one page is enough for an hour)."""
    url = f"{BUCKET}/?list-type=2&prefix={prefix}&max-keys=1000"
    with urllib.request.urlopen(url, timeout=timeout) as res:
        root = ET.fromstring(res.read())
    ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
    return [el.text for el in root.findall("s3:Contents/s3:Key", ns) if el.text]


def pick_latest_scan(keys: list[str]) -> tuple[str, list[str]] | None:
    """Newest scan that has every band and segment we need; returns its ISO time and the keys."""
    scans: dict[str, dict[tuple[str, str], str]] = {}
    for key in keys:
        m = FILE_RE.search(key)
        if not m or m["band"] not in BANDS or m["segment"] not in SEGMENTS:
            continue
        scans.setdefault(m["date"] + m["time"], {})[(m["band"], m["segment"])] = key
    complete = [stamp for stamp, files in scans.items() if len(files) == len(BANDS) * len(SEGMENTS)]
    if not complete:
        return None
    stamp = max(complete)
    when = dt.datetime.strptime(stamp, "%Y%m%d%H%M").replace(tzinfo=dt.UTC)
    return when.strftime("%Y-%m-%dT%H:%M:%SZ"), sorted(scans[stamp].values())


def find_latest_scan(now: dt.datetime) -> tuple[str, list[str]] | None:
    """Looks at the current and the previous UTC hour, newest first."""
    for hour in (now, now - dt.timedelta(hours=1)):
        keys = list_keys(f"{PREFIX}/{hour:%Y/%m/%d}/{hour:%H}")
        found = pick_latest_scan(keys)
        if found:
            return found
    return None


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


def download(keys: list[str], into: Path) -> list[Path]:
    paths: list[Path] = []
    for key in keys:
        dest = into / Path(key).name
        urllib.request.urlretrieve(f"{BUCKET}/{key}", dest)
        paths.append(dest)
        log.info("downloaded %s (%d KB)", dest.name, dest.stat().st_size // 1024)
    return paths


def render(files: list[Path]) -> np.ndarray:
    """Loads the scan with satpy, resamples to the region grid and returns the RGBA composite."""
    from pyresample.geometry import AreaDefinition
    from satpy import Scene

    extent, (width, height) = mercator_extent(resolution_m=RESOLUTION_M, **REGION)
    area = AreaDefinition("indonesia", "Indonesia", "indonesia", "EPSG:3857", width, height, extent)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        scene = Scene(reader="ahi_hsd", filenames=[str(f) for f in files])
        scene.load(list(BANDS), calibration="brightness_temperature")
        local = scene.resample(area, resampler="nearest", radius_of_influence=6000)
        bands = {name: np.asarray(local[name].values, dtype=np.float64) for name in BANDS}
    return compose_rgb(bands["B11"], bands["B13"], bands["B15"])


def read_previous(out_dir: Path) -> dict | None:
    path = out_dir / JSON_NAME
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


def write_outputs(out_dir: Path, rgba: np.ndarray, scan_time: str) -> None:
    from PIL import Image

    out_dir.mkdir(parents=True, exist_ok=True)
    # Lossy WebP keeps the smooth colour gradients and is about 15 times smaller than PNG.
    Image.fromarray(rgba, "RGBA").save(out_dir / IMAGE_NAME, "WEBP", quality=85, method=6)
    meta = {
        "scanTime": scan_time,
        "generatedAt": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "bounds": REGION,
        "width": int(rgba.shape[1]),
        "height": int(rgba.shape[0]),
        "image": IMAGE_NAME,
        "source": SOURCE,
        "error": None,
    }
    (out_dir / JSON_NAME).write_text(json.dumps(meta, indent=2) + "\n")
    log.info("wrote %s for scan %s (%dx%d)", IMAGE_NAME, scan_time, meta["width"], meta["height"])


def write_error(out_dir: Path, previous: dict | None, message: str) -> None:
    """Records the failure but keeps the previous image and its scan time, if any."""
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = dict(previous or {"scanTime": None, "bounds": REGION, "image": None, "source": SOURCE})
    meta["generatedAt"] = dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta["error"] = message
    (out_dir / JSON_NAME).write_text(json.dumps(meta, indent=2) + "\n")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logging.getLogger("satpy").setLevel(logging.WARNING)
    out_dir = OUT_DIR
    previous = read_previous(out_dir)
    try:
        found = find_latest_scan(dt.datetime.now(dt.UTC))
        if not found:
            raise RuntimeError("no complete Himawari-9 scan in the last two hours")
        scan_time, keys = found
        if previous and previous.get("scanTime") == scan_time and previous.get("error") is None:
            log.info("scan %s already rendered", scan_time)
            return 0
        with tempfile.TemporaryDirectory() as tmp:
            files = download(keys, Path(tmp))
            rgba = render(files)
        write_outputs(out_dir, rgba, scan_time)
        return 0
    except Exception as exc:  # noqa: BLE001 - any failure must be recorded, the deploy goes on
        log.error("ash rgb failed: %s", exc)
        write_error(out_dir, previous, f"{type(exc).__name__}: {exc}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
