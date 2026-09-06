import numpy as np
import pytest

from scripts.himawari import clear_sky_reference, keep_near_sources, lift_index


def test_clear_sky_reference_is_the_per_pixel_minimum_ignoring_missing_days() -> None:
    day1 = np.array([[-3.0, np.nan], [-2.0, -4.0]])
    day2 = np.array([[-3.5, -2.5], [np.nan, -1.0]])
    ref = clear_sky_reference([day1, day2])
    assert ref[0, 0] == -3.5
    assert ref[0, 1] == -2.5
    assert ref[1, 0] == -2.0
    assert ref[1, 1] == -4.0


def test_clear_sky_reference_is_nan_where_no_day_has_data() -> None:
    ref = clear_sky_reference([np.array([[np.nan]]), np.array([[np.nan]])])
    assert np.isnan(ref[0, 0])


def test_lift_index_ramps_between_the_thresholds_and_masks_missing() -> None:
    s_now = np.array([-3.0, -1.8, -0.9, 0.5, np.nan])
    ref = np.array([-3.0, -3.0, -3.0, -3.0, -3.0])
    idx = lift_index(s_now, ref, low=1.2, high=3.0)
    assert idx == pytest.approx([0.0, 0.0, 0.5, 1.0, 0.0])


def test_keep_near_sources_drops_blobs_away_from_zones_and_volcanoes() -> None:
    index = np.zeros((20, 20))
    index[2:5, 2:5] = 0.8  # touches the zone
    index[14:17, 14:17] = 0.9  # far from everything
    zone = np.zeros((20, 20), dtype=bool)
    zone[0:6, 0:6] = True
    near = np.zeros((20, 20), dtype=bool)
    kept, stats = keep_near_sources(index, zone_mask=zone, near_mask=near, min_index=0.25)
    assert kept[3, 3] == pytest.approx(0.8)
    assert kept[15, 15] == 0.0
    assert stats == {"blobsKept": 1, "blobsRejected": 1}


def test_keep_near_sources_accepts_blobs_close_to_a_volcano() -> None:
    index = np.zeros((10, 10))
    index[6:9, 6:9] = 0.5
    zone = np.zeros((10, 10), dtype=bool)
    near = np.zeros((10, 10), dtype=bool)
    near[5:10, 5:10] = True
    kept, stats = keep_near_sources(index, zone_mask=zone, near_mask=near, min_index=0.25)
    assert kept[7, 7] == pytest.approx(0.5)
    assert stats["blobsKept"] == 1
