import io
import numpy as np
import cv2

# torch must be imported before transformers so transformers can detect it
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

app = FastAPI()

# TrOCR: Microsoft's transformer model fine-tuned on handwritten text (IAM dataset).
# The processor converts PIL images into normalised tensors the model expects.
# The model generates token sequences which are decoded back to strings.
# Models are cached in ~/.cache/huggingface/ after the first download (~350 MB).
print('[startup] loading TrOCR...')
processor = TrOCRProcessor.from_pretrained('microsoft/trocr-base-handwritten')
model = VisionEncoderDecoderModel.from_pretrained(
    'microsoft/trocr-base-handwritten', use_safetensors=True
)
model.eval()  # inference mode — disables dropout layers used only during training
print('[startup] ready')

# Column field names must match the TypeScript TableRow type in lib/types.ts
FIELDS = ['clientName', 'clientId', 'weekEnding1', 'weekEnding2', 'nightHours', 'sundayHours', 'bankHolidayHours']
NUM_COLS = 7
NUM_DATA_ROWS = 29
# The column header row is tall enough that the grid detector finds several
# sub-rows within it. Skip all of them before reaching the first data row.
HEADER_ROWS = 4

# Footer rows have pre-printed labels in clientName / clientId that are always
# correct. We hardcode them so TrOCR never has to read printed text.
# The hours columns (weekEnding1 onward) are still OCR'd because they may
# contain handwritten values (break-time hours, totals, etc.).
# Row 24 is a blank separator and row 25+ have the Comments Box / Signature /
# Date block in cols 3-6, so those cols are skipped for those rows.
FOOTER_PREPRINTED: dict[int, dict[str, str]] = {
    21: {'clientName': 'Break Times',      'clientId': '77777'},
    22: {'clientName': 'Shadowing',         'clientId': '88888'},
    23: {'clientName': 'Training/Other',    'clientId': '99998'},
    25: {'clientName': 'TOTALS'},
    26: {'clientName': 'No. Sat worked:',  'clientId': 'Less than 4Hrs'},
    27: {'clientName': 'No. Sat worked:',  'clientId': 'More than 4Hrs'},
    28: {'clientName': 'Travel Kilometres:'},
}
FOOTER_START_ROW = 21       # first footer row index in data_rows
COMMENTS_BOX_START_ROW = 25 # from here, cols 3-6 are the embedded Comments Box
COMMENTS_BOX_COL_LIMIT = 3  # only OCR cols 0-2 in those rows


# ---------------------------------------------------------------------------
# Image preprocessing and grid detection
# ---------------------------------------------------------------------------

def preprocess(img_np: np.ndarray) -> np.ndarray:
    """Convert to greyscale and apply adaptive thresholding.

    Adaptive thresholding divides the image into small regions and computes
    a local threshold for each one. This handles uneven lighting and varying
    scan quality far better than a single global brightness cutoff.
    The result is a binary image (black background, white lines/text).
    """
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    return cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=15,  # size of neighbourhood region (must be odd)
        C=4,           # constant subtracted from the mean — tunes sensitivity
    )


def deskew(img_np: np.ndarray, thresh: np.ndarray) -> np.ndarray:
    """Correct slight rotational skew introduced during scanning.

    Uses the Probabilistic Hough Line Transform to find straight line segments
    in the thresholded image. We keep only the near-horizontal lines (those
    whose run is greater than their rise) because those correspond to the
    printed table rules. Taking the median angle across all detected horizontal
    lines gives a robust estimate of the skew. The image is then rotated by
    that angle around its centre. If the skew is less than 0.3° we skip it —
    the correction would be imperceptible and not worth the interpolation cost.
    """
    lines = cv2.HoughLinesP(
        thresh, rho=1, theta=np.pi / 180, threshold=100,
        minLineLength=img_np.shape[1] // 4,  # line must span at least 25% of width
        maxLineGap=20,
    )
    if lines is None:
        return img_np

    angles = [
        np.degrees(np.arctan2(y2 - y1, x2 - x1))
        for x1, y1, x2, y2 in (l[0] for l in lines)
        if abs(x2 - x1) > abs(y2 - y1)  # keep only horizontal-ish lines
    ]
    if not angles:
        return img_np

    angle = float(np.median(angles))
    if abs(angle) < 0.3:
        return img_np

    print(f'[Grid] correcting skew by {angle:.2f}°')
    h, w = img_np.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(img_np, M, (w, h),
                          flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REPLICATE)


def find_line_centers(projection: np.ndarray, min_gap: int = 8) -> list[int]:
    """Convert a 1-D pixel-sum projection into a list of line centre positions.

    We sum pixel values along one axis to get a projection curve — peaks in
    that curve correspond to lines in the image. We walk the projection and
    record the midpoint of each run that exceeds 25% of the maximum value.
    min_gap prevents two adjacent peaks from being counted as separate lines.
    """
    threshold = float(projection.max()) * 0.25
    centers: list[int] = []
    in_band = False
    band_start = 0

    for i, val in enumerate(projection.tolist()):
        if val >= threshold and not in_band:
            in_band = True
            band_start = i
        elif val < threshold and in_band:
            in_band = False
            center = (band_start + i) // 2
            if not centers or center - centers[-1] > min_gap:
                centers.append(center)

    return centers


def extract_cell_grid(img: Image.Image) -> list[list[Image.Image]]:
    """Detect the printed table grid and return a 2-D list of cell image crops.

    The overall strategy:
      1. Preprocess to a binary image.
      2. Correct any scan skew.
      3. Use morphological opening to isolate horizontal lines (long thin kernels
         suppress anything that isn't a long horizontal stroke).
      4. Do the same vertically to isolate vertical lines.
      5. Sum pixel columns/rows to get 1-D projections, then find line centres.
      6. Use adjacent pairs of horizontal centres as row boundaries, adjacent
         pairs of vertical centres as column boundaries — that gives us every
         cell rectangle in the grid.
      7. Crop each rectangle from the (deskewed) original image.
    """
    img_np = np.array(img.convert('RGB'))
    thresh = preprocess(img_np)
    img_np = deskew(img_np, thresh)
    thresh = preprocess(img_np)          # re-threshold after rotation

    h, w = thresh.shape

    # Morphological opening with a wide horizontal kernel isolates long
    # horizontal strokes (the printed table rules) and removes noise and text.
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (w // 12, 1))
    horiz = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, h_kernel)
    horiz = cv2.dilate(horiz, np.ones((3, 1), np.uint8), iterations=2)

    # Same idea vertically.
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, h // 12))
    vert = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, v_kernel)
    vert = cv2.dilate(vert, np.ones((1, 3), np.uint8), iterations=2)

    y_lines = find_line_centers(np.sum(horiz, axis=1))  # sum across columns → row projection
    x_lines = find_line_centers(np.sum(vert, axis=0))   # sum across rows → column projection

    print(f'[Grid] {len(y_lines)} horizontal lines, {len(x_lines)} vertical lines')

    if len(y_lines) < 2 or len(x_lines) < 2:
        return []

    img_pil = Image.fromarray(img_np)
    padding = 3  # pixels to trim from each cell edge to exclude the line itself
    grid: list[list[Image.Image]] = []

    for r in range(len(y_lines) - 1):
        row: list[Image.Image] = []
        for c in range(len(x_lines) - 1):
            y0, y1 = y_lines[r] + padding, y_lines[r + 1] - padding
            x0, x1 = x_lines[c] + padding, x_lines[c + 1] - padding
            if y1 > y0 and x1 > x0:
                row.append(img_pil.crop((x0, y0, x1, y1)))
        if row:
            grid.append(row)

    return grid


# ---------------------------------------------------------------------------
# Cell content detection and TrOCR recognition
# ---------------------------------------------------------------------------

def has_content(crop: Image.Image, threshold: float = 0.04) -> bool:
    """Return True if the cell contains enough dark pixels to be non-empty.

    Avoids wasting TrOCR inference time on blank cells. We check what fraction
    of pixels are darker than 190/255. Scanner noise and grid-line bleed stay
    well below 4% dark coverage; actual handwriting reliably exceeds it.
    """
    gray = np.array(crop.convert('L'))
    return float(np.sum(gray < 190)) / gray.size > threshold


def recognize_batch(crops: list[Image.Image], batch_size: int = 16) -> list[str]:
    """Run TrOCR on a list of cell crops, returning one string per crop.

    Processes crops in batches to keep memory usage bounded. The processor
    resizes and normalises each image into a fixed-size tensor. model.generate()
    runs the encoder (ViT image encoder) then the decoder (transformer) to
    produce token ID sequences. batch_decode converts those back to strings.
    """
    results: list[str] = []
    for i in range(0, len(crops), batch_size):
        batch = [c.convert('RGB') for c in crops[i:i + batch_size]]
        pixel_values = processor(images=batch, return_tensors='pt').pixel_values
        with torch.no_grad():
            generated_ids = model.generate(pixel_values, max_new_tokens=32)
        results.extend(
            t.strip()
            for t in processor.batch_decode(generated_ids, skip_special_tokens=True)
        )
    return results


# ---------------------------------------------------------------------------
# FastAPI route
# ---------------------------------------------------------------------------

@app.post('/ocr')
async def run_ocr(image: UploadFile = File(...)):
    try:
        return await _run_ocr(image)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


async def _run_ocr(image: UploadFile):
    contents = await image.read()
    img = Image.open(io.BytesIO(contents)).convert('RGB')

    # Step 1: detect the printed grid and get every cell as a PIL crop
    grid = extract_cell_grid(img)
    num_cols = max((len(r) for r in grid), default=0)
    print(f'[Grid] {len(grid)} rows × {num_cols} cols extracted')

    if len(grid) <= HEADER_ROWS:
        return {'rows': [{field: '' for field in FIELDS} for _ in range(NUM_DATA_ROWS)]}

    # Step 2: skip the header area (pre-printed column names plus any sub-rows
    # the detector finds within the tall header cell), then take exactly 21 rows.
    # The pre-printed footer (Break Times, Shadowing, Totals, etc.) falls beyond
    # row index HEADER_ROWS + NUM_DATA_ROWS and is intentionally excluded.
    data_rows = grid[HEADER_ROWS:HEADER_ROWS + NUM_DATA_ROWS]

    # Step 3: collect only non-empty cells to minimise TrOCR calls
    crops_to_run: list[Image.Image] = []
    crop_positions: list[tuple[int, int]] = []

    for ri, row in enumerate(data_rows):
        # Footer rows: cols 0-3 are either pre-printed labels or always-empty
        # week-ending cells — skip straight to the hours columns (4-6).
        col_start = 4 if ri >= FOOTER_START_ROW else 0
        # Comments Box occupies cols 3-6 from TOTALS row onwards.
        col_end = COMMENTS_BOX_COL_LIMIT if ri >= COMMENTS_BOX_START_ROW else NUM_COLS
        for ci in range(col_start, min(col_end, len(row))):
            if has_content(row[ci]):
                crops_to_run.append(row[ci])
                crop_positions.append((ri, ci))

    total_cells = NUM_DATA_ROWS * NUM_COLS
    print(f'[OCR] {len(crops_to_run)} non-empty cells of {total_cells} — running TrOCR')

    # Step 4: run TrOCR in batches
    texts = recognize_batch(crops_to_run)

    # Step 5: place recognised text back into a 2-D grid, then build row dicts.
    # Always NUM_DATA_ROWS rows so the table is full-sized even on a blank form.
    text_grid = [['' for _ in range(NUM_COLS)] for _ in range(NUM_DATA_ROWS)]
    for text, (ri, ci) in zip(texts, crop_positions):
        text_grid[ri][ci] = text

    table_rows = []
    for ri, row_vals in enumerate(text_grid):
        row = {field: row_vals[i] for i, field in enumerate(FIELDS)}
        row.update(FOOTER_PREPRINTED.get(ri, {}))
        table_rows.append(row)

    return {'rows': table_rows}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)
