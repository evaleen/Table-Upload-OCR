"""Tests for the pure computer-vision functions in server.py.

These tests load no ML models — they use synthetic numpy arrays and PIL images
so the suite runs in milliseconds without any GPU/CPU-heavy inference.
"""

import numpy as np
import pytest
from PIL import Image, ImageDraw

# Importing server triggers model loading at module level, so we patch the
# heavyweight calls before the import happens.
from unittest.mock import MagicMock, patch

with patch('transformers.TrOCRProcessor.from_pretrained', return_value=MagicMock()), \
     patch('transformers.VisionEncoderDecoderModel.from_pretrained', return_value=MagicMock()):
    from server import preprocess, find_line_centers, has_content, extract_cell_grid


# ---------------------------------------------------------------------------
# preprocess
# ---------------------------------------------------------------------------

class TestPreprocess:
    def test_output_shape_matches_input(self):
        img = np.zeros((100, 200, 3), dtype=np.uint8)
        result = preprocess(img)
        assert result.shape == (100, 200)

    def test_output_is_binary(self):
        img = np.full((50, 50, 3), 128, dtype=np.uint8)
        result = preprocess(img)
        unique = set(result.flatten().tolist())
        assert unique <= {0, 255}

    def test_white_image_produces_black_output(self):
        # A pure white image has no ink — adaptive threshold should give all zeros
        img = np.full((50, 50, 3), 255, dtype=np.uint8)
        result = preprocess(img)
        assert result.max() == 0


# ---------------------------------------------------------------------------
# find_line_centers
# ---------------------------------------------------------------------------

class TestFindLineCenters:
    def test_empty_projection_returns_empty(self):
        proj = np.zeros(100)
        assert find_line_centers(proj) == []

    def test_single_peak_returns_its_midpoint(self):
        proj = np.zeros(100)
        proj[40:50] = 100          # peak spanning indices 40–49; band exits at 50, midpoint = 45
        centers = find_line_centers(proj)
        assert len(centers) == 1
        assert centers[0] == 45

    def test_two_separated_peaks_returns_two_centers(self):
        proj = np.zeros(200)
        proj[20:30] = 100          # first peak,  midpoint = 24
        proj[100:110] = 100        # second peak, midpoint = 104
        centers = find_line_centers(proj)
        assert len(centers) == 2

    def test_min_gap_merges_adjacent_peaks(self):
        proj = np.zeros(100)
        proj[20:25] = 100
        proj[27:32] = 100          # only 2 px apart — within default min_gap of 8
        centers = find_line_centers(proj, min_gap=8)
        assert len(centers) == 1

    def test_min_gap_separates_distant_peaks(self):
        proj = np.zeros(100)
        proj[10:15] = 100
        proj[50:55] = 100          # 35 px apart — well beyond min_gap
        centers = find_line_centers(proj, min_gap=8)
        assert len(centers) == 2


# ---------------------------------------------------------------------------
# has_content
# ---------------------------------------------------------------------------

class TestHasContent:
    def _make_image(self, width: int, height: int, fill: int) -> Image.Image:
        return Image.fromarray(np.full((height, width), fill, dtype=np.uint8), mode='L')

    def test_pure_white_image_returns_false(self):
        img = self._make_image(50, 50, 255)
        assert has_content(img) is False

    def test_pure_black_image_returns_true(self):
        img = self._make_image(50, 50, 0)
        assert has_content(img) is True

    def test_image_below_threshold_returns_false(self):
        # 1% dark pixels — below the 4% threshold
        img = np.full((100, 100), 255, dtype=np.uint8)
        img[:1, :100] = 0          # 100 dark pixels out of 10 000 = 1%
        assert has_content(Image.fromarray(img, mode='L')) is False

    def test_image_above_threshold_returns_true(self):
        # 5% dark pixels — above the 4% threshold
        img = np.full((100, 100), 255, dtype=np.uint8)
        img[:5, :100] = 0          # 500 dark pixels out of 10 000 = 5%
        assert has_content(Image.fromarray(img, mode='L')) is True


# ---------------------------------------------------------------------------
# extract_cell_grid
# ---------------------------------------------------------------------------

def _draw_grid(rows: int, cols: int, cell_w: int = 60, cell_h: int = 30) -> Image.Image:
    """Draw a simple black-line grid on a white background."""
    width = cols * cell_w + 1
    height = rows * cell_h + 1
    img = Image.new('RGB', (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    for c in range(cols + 1):
        x = c * cell_w
        draw.line([(x, 0), (x, height - 1)], fill=(0, 0, 0), width=2)
    for r in range(rows + 1):
        y = r * cell_h
        draw.line([(0, y), (width - 1, y)], fill=(0, 0, 0), width=2)
    return img


class TestExtractCellGrid:
    def test_blank_image_returns_empty_grid(self):
        blank = Image.new('RGB', (400, 600), color=(255, 255, 255))
        assert extract_cell_grid(blank) == []

    def test_grid_returns_2d_list(self):
        img = _draw_grid(rows=3, cols=4)
        grid = extract_cell_grid(img)
        assert isinstance(grid, list)
        assert len(grid) > 0
        assert all(isinstance(row, list) for row in grid)

    def test_grid_cells_are_pil_images(self):
        img = _draw_grid(rows=3, cols=4)
        grid = extract_cell_grid(img)
        for row in grid:
            for cell in row:
                assert isinstance(cell, Image.Image)

    def test_grid_detects_approximately_correct_row_count(self):
        # Draw a 4-row grid; we expect roughly 3 interior rows detected
        # (the detector may find the header row separately — allow ±1)
        img = _draw_grid(rows=4, cols=3, cell_w=80, cell_h=40)
        grid = extract_cell_grid(img)
        assert 2 <= len(grid) <= 5
