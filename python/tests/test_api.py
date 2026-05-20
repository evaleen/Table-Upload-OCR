"""Integration tests for the FastAPI /ocr endpoint.

TrOCR is mocked so the suite runs without loading model weights.
The mock recognize_batch returns empty strings for all crops, simulating a
blank form — which is the easiest state to make deterministic assertions about.
"""

import io
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PIL import Image, ImageDraw


def _make_png_bytes(width: int = 400, height: int = 600) -> bytes:
    """Return a minimal white PNG as bytes."""
    img = Image.new('RGB', (width, height), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def _draw_grid_png(rows: int = 33, cols: int = 7,
                   cell_w: int = 60, cell_h: int = 20) -> bytes:
    """Draw a grid large enough for the server to detect HEADER_ROWS + NUM_DATA_ROWS."""
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
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


# Patch model loading before importing anything from server
with patch('transformers.TrOCRProcessor.from_pretrained', return_value=MagicMock()), \
     patch('transformers.VisionEncoderDecoderModel.from_pretrained', return_value=MagicMock()):
    from server import app, FIELDS, FOOTER_PREPRINTED, NUM_DATA_ROWS

from fastapi.testclient import TestClient

client = TestClient(app)


class TestOcrEndpoint:
    def test_missing_file_returns_422(self):
        res = client.post('/ocr')
        assert res.status_code == 422

    def test_valid_image_returns_200(self):
        with patch('server.recognize_batch', return_value=[]):
            res = client.post('/ocr', files={'image': ('sheet.png', _make_png_bytes(), 'image/png')})
        assert res.status_code == 200

    def test_response_has_rows_key(self):
        with patch('server.recognize_batch', return_value=[]):
            res = client.post('/ocr', files={'image': ('sheet.png', _make_png_bytes(), 'image/png')})
        assert 'rows' in res.json()

    def test_response_always_has_num_data_rows(self):
        with patch('server.recognize_batch', return_value=[]):
            res = client.post('/ocr', files={'image': ('sheet.png', _make_png_bytes(), 'image/png')})
        assert len(res.json()['rows']) == NUM_DATA_ROWS

    def test_each_row_has_all_fields(self):
        with patch('server.recognize_batch', return_value=[]):
            res = client.post('/ocr', files={'image': ('sheet.png', _make_png_bytes(), 'image/png')})
        for row in res.json()['rows']:
            assert set(row.keys()) == set(FIELDS)


class TestFooterPreprinted:
    """The hardcoded footer labels must always appear regardless of OCR output."""

    def _rows(self):
        # A blank image produces no detected grid, triggering the early-return
        # path before FOOTER_PREPRINTED is applied. Patch extract_cell_grid to
        # return a full-sized fake grid so _run_ocr reaches the label-merging step.
        from server import HEADER_ROWS, NUM_DATA_ROWS, NUM_COLS
        blank_cell = Image.new('RGB', (50, 20), color=(255, 255, 255))
        fake_grid = [[blank_cell] * NUM_COLS for _ in range(HEADER_ROWS + NUM_DATA_ROWS)]
        with patch('server.extract_cell_grid', return_value=fake_grid), \
             patch('server.recognize_batch', return_value=[]):
            res = client.post('/ocr', files={'image': ('sheet.png', _make_png_bytes(), 'image/png')})
        return res.json()['rows']

    @pytest.mark.parametrize('row_idx,field,expected', [
        (21, 'clientName', 'Break Times'),
        (21, 'clientId',   '77777'),
        (22, 'clientName', 'Shadowing'),
        (22, 'clientId',   '88888'),
        (23, 'clientName', 'Training/Other'),
        (23, 'clientId',   '99998'),
        (25, 'clientName', 'TOTALS'),
        (26, 'clientName', 'No. Sat worked:'),
        (26, 'clientId',   'Less than 4Hrs'),
        (27, 'clientName', 'No. Sat worked:'),
        (27, 'clientId',   'More than 4Hrs'),
        (28, 'clientName', 'Travel Kilometres:'),
    ])
    def test_footer_label(self, row_idx, field, expected):
        rows = self._rows()
        assert rows[row_idx][field] == expected
