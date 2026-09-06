import numpy as np
import pytest

from scripts.himawari import compose_rgb, mercator_extent, pick_latest_scan, scale_band


def key(scan: str, band: str, seg: str) -> str:
    return f"AHI-L1b-FLDK/2026/09/06/{scan}/HS_H09_20260906_{scan}_{band}_FLDK_R20_{seg}.DAT.bz2"


SEGS = ("S0510", "S0610", "S0710")


def test_pick_latest_scan_needs_every_band_and_segment() -> None:
    keys = [key("0500", b, s) for b in ("B11", "B13", "B15") for s in SEGS]
    keys += [key("0510", b, s) for b in ("B11", "B13") for s in SEGS]  # B15 missing
    keys += [key("0510", "B15", "S0610")]
    scan, files = pick_latest_scan(keys)
    assert scan == "2026-09-06T05:00:00Z"
    assert len(files) == 9
    assert all("_0500_" in f for f in files)


def test_pick_latest_scan_ignores_other_resolutions_and_returns_none_when_empty() -> None:
    keys = [key("0500", b, s).replace("R20", "R10") for b in ("B11", "B13", "B15") for s in SEGS]
    assert pick_latest_scan(keys) is None
    assert pick_latest_scan([]) is None


def test_scale_band_maps_the_range_to_0_1_and_clips() -> None:
    data = np.array([-5.0, -4.0, -1.0, 2.0, 3.0, np.nan])
    out = scale_band(data, -4.0, 2.0)
    assert out[:5] == pytest.approx([0.0, 0.0, 0.5, 1.0, 1.0])
    assert out[5] == 0.0


def test_compose_rgb_follows_the_jma_recipe_and_masks_missing_pixels() -> None:
    b11 = np.array([[280.0, np.nan]])
    b13 = np.array([[273.0, 273.0]])
    b15 = np.array([[272.0, 272.0]])
    rgba = compose_rgb(b11, b13, b15)
    assert rgba.shape == (1, 2, 4)
    assert rgba.dtype == np.uint8
    # red = b15 - b13 = -1 K -> (-1 + 4) / 6 = 0.5; green = b13 - b11 = -7 K -> 0; blue = 273 K -> 0.5
    assert list(rgba[0, 0]) == pytest.approx([128, 0, 128, 255], abs=1)
    assert rgba[0, 1, 3] == 0


def test_mercator_extent_is_symmetric_about_the_equator_and_sized_in_metres() -> None:
    extent, (width, height) = mercator_extent(
        west=100.0, south=-10.0, east=110.0, north=10.0, resolution_m=2000.0
    )
    x0, y0, x1, y1 = extent
    assert x0 > 0  # east of Greenwich
    assert y0 == pytest.approx(-y1)
    assert x1 - x0 == pytest.approx(width * 2000.0, rel=1e-3)
    assert y1 - y0 == pytest.approx(height * 2000.0, rel=1e-3)
    assert width == pytest.approx(556, abs=1)  # 10 degrees of longitude is 1113 km at the equator


def test_complete_scans_accepts_only_the_native_resolution_of_each_band() -> None:
    from scripts.himawari import VISIBLE_BANDS, complete_scans

    def vis(band: str, res: str, seg: str) -> str:
        return f"AHI-L1b-FLDK/2026/09/06/0520/HS_H09_20260906_0520_{band}_FLDK_{res}_{seg}.DAT.bz2"

    keys = []
    for seg in SEGS:
        keys += [
            vis("B01", "R10", seg),
            vis("B02", "R10", seg),
            vis("B03", "R05", seg),
            vis("B04", "R10", seg),
        ]
    assert list(complete_scans(keys, VISIBLE_BANDS)) == ["202609060520"]
    # A red band at the wrong resolution does not count.
    wrong = [k.replace("B03_FLDK_R05", "B03_FLDK_R20") for k in keys]
    assert complete_scans(wrong, VISIBLE_BANDS) == {}


def test_daylight_fraction_is_high_at_local_noon_and_zero_at_midnight() -> None:
    import datetime as dt

    from scripts.himawari import daylight_fraction

    noon = dt.datetime(2026, 9, 6, 4, 30, tzinfo=dt.UTC)  # 11:30 WIB
    midnight = dt.datetime(2026, 9, 6, 17, 0, tzinfo=dt.UTC)  # 00:00 WIB
    assert daylight_fraction(noon, width=60, height=32) > 0.9
    assert daylight_fraction(midnight, width=60, height=32) == 0.0
