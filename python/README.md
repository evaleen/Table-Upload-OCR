# Python OCR Service

FastAPI server that receives a scanned timesheet image, detects the printed table grid using computer vision, and reads the handwritten cell contents using a pre-trained transformer model. Returns JSON that the Next.js front-end renders as an editable review table.

## How to run

```bash
cd python
python3.12 -m venv venv          # only needed once
source venv/bin/activate
pip install -r requirements.txt  # only needed once (downloads ~350 MB of model weights on first run)

PYTHONUNBUFFERED=1 python server.py
```

The server listens on `http://localhost:8000`. The Next.js app proxies `/api/ocr` requests to it.

## Dependencies

| Package | Why |
|---|---|
| `fastapi` + `uvicorn` | HTTP server framework |
| `pillow` | Image loading and cropping |
| `opencv-python` | Grid detection (thresholding, morphology, Hough lines) |
| `numpy<2` | Required by torch 2.2.2 — numpy 2.x is incompatible |
| `torch` | Tensor operations for TrOCR |
| `transformers<5` | TrOCR model loader — v5 requires PyTorch ≥ 2.4, unavailable on Intel Mac |
| `safetensors` | Secure model weight loading (avoids `torch.load` pickle vulnerability) |

---

## Pipeline overview

```
Upload image
    │
    ▼
preprocess()         — greyscale + adaptive threshold → binary image
    │
    ▼
deskew()             — detect near-horizontal lines, rotate by median angle
    │
    ▼
extract_cell_grid()  — morphological opening → projections → crop every cell
    │
    ▼
has_content()        — skip blank cells (saves ~80% of TrOCR calls on typical forms)
    │
    ▼
recognize_batch()    — TrOCR on non-empty cells, 16 at a time
    │
    ▼
JSON response        — {rows: [{clientName, clientId, …}, …]}
```

---

## Function-by-function explanation

### `preprocess(img_np)`

Converts the image to greyscale and applies **adaptive thresholding**.

A single global brightness threshold fails when a scan is unevenly lit (brighter near the scanner lamp, darker at the edges). Adaptive thresholding divides the image into small neighbourhoods (15 × 15 pixels here) and computes a separate threshold for each one based on local brightness. The result is a **binary image** — white pixels where there is ink (table lines or handwriting), black pixels everywhere else — regardless of how the lighting varied across the scan.

The `THRESH_BINARY_INV` flag inverts the convention so the ink is white on a black background, which is what the morphological operations below expect.

### `deskew(img_np, thresh)`

Corrects rotational skew introduced by placing the sheet at a slight angle in the scanner.

1. Runs the **Probabilistic Hough Line Transform** on the thresholded image. This finds straight line segments without requiring them to run edge-to-edge — it samples random subsets of edge pixels, which is faster and more robust to noise.
2. Keeps only **near-horizontal** lines (those where the horizontal span is greater than the vertical span) because those correspond to the printed table rules, not the vertical dividers or handwriting strokes.
3. Computes the **median angle** across all those lines. Using the median rather than the mean prevents a few steeply-angled segments from skewing the result.
4. Skips the rotation if the angle is less than 0.3° — the correction would be sub-pixel and not worth the interpolation cost.
5. Applies an affine rotation around the image centre using cubic interpolation (smoother than nearest-neighbour) and fills newly-exposed border pixels by replicating the nearest edge pixels.

### `find_line_centers(projection, min_gap=8)`

Converts a 1-D array of pixel sums into a list of line positions.

After morphological isolation (see below), we sum all pixel values across one axis to get a **projection curve**. A peak in this curve means there is a concentration of white pixels at that coordinate — i.e., a line in the image. This function walks the array and records the **midpoint of each peak** that exceeds 25% of the maximum value. The `min_gap` parameter prevents two closely-spaced peaks (e.g., a thick line that straddles two projection bins) from being counted as separate lines.

### `extract_cell_grid(img)`

The main grid-detection function. Returns a 2-D list of PIL Image crops — one per cell.

1. **Preprocess** the image to binary.
2. **Deskew** using the thresholded image, then re-threshold the rotated image.
3. **Isolate horizontal lines** using morphological opening with a wide, 1-pixel-tall kernel (`width / 12` wide). Opening = erosion followed by dilation. The erosion removes any feature narrower than the kernel, so only long horizontal strokes (the table rules) survive. Text characters and vertical lines are suppressed. A small dilation afterwards fattens the surviving lines so the projection peaks are easier to detect.
4. **Isolate vertical lines** the same way with a tall, 1-pixel-wide kernel.
5. **Sum columns** of the horizontal-lines image to get a row projection. **Sum rows** of the vertical-lines image to get a column projection.
6. Call `find_line_centers` on each projection to get the y-coordinates of horizontal lines and the x-coordinates of vertical lines.
7. Use adjacent pairs of y-coordinates as row boundaries and adjacent pairs of x-coordinates as column boundaries. Crop each resulting rectangle from the deskewed original image with a 3-pixel inward padding to exclude the line itself.

### `has_content(crop, threshold=0.04)`

Quick check for whether a cell contains any handwriting.

Converts the crop to greyscale and counts what fraction of pixels are darker than 190/255. If less than 4% of pixels are dark, the cell is treated as blank and TrOCR is not called for it. Scanner noise and grid-line bleed stay well below this threshold; actual handwriting reliably exceeds it. On a typical form where most numeric cells are empty, this skips the majority of cells and significantly reduces processing time.

### `recognize_batch(crops, batch_size=16)`

Runs **TrOCR** (`microsoft/trocr-base-handwritten`) on a list of cell images.

TrOCR is a transformer model trained end-to-end on handwritten text. It has two parts:
- A **ViT image encoder** that converts the cell image into a sequence of patch embeddings.
- A **transformer decoder** that generates text tokens from those embeddings, one token at a time, until it produces an end-of-sequence token.

Processing in batches of 16 amortises the fixed overhead of moving data to/from the model. The `processor` handles resizing each crop to the fixed input size TrOCR expects and normalising pixel values. `model.generate` runs the encoder once and the decoder iteratively. `batch_decode` converts token IDs back to strings and strips special tokens like `<s>` and `</s>`.

The model weights are downloaded from Hugging Face on first run (~350 MB) and cached in `~/.cache/huggingface/`. Subsequent starts load from the local cache.

### `_run_ocr(image)` (the route handler)

Orchestrates the full pipeline:

1. Opens the uploaded file as a PIL Image.
2. Calls `extract_cell_grid` to get every cell crop.
3. Skips the first `HEADER_ROWS` (4) detected rows — the printed column header is tall enough that the grid detector finds several sub-rows within it, all of which are skipped.
4. Takes exactly `NUM_DATA_ROWS` (29) rows after that: 21 client data rows followed by 8 pre-printed footer rows (Break Times, Shadowing, Training/Other, a blank separator, TOTALS, No. Sat worked ×2, Travel Kilometres).
5. For footer rows, pre-printed labels (`clientName`, `clientId`) are hardcoded from `FOOTER_PREPRINTED` rather than OCR'd. Only the hours columns (4–6) are passed to TrOCR for those rows, and cols 3–6 are skipped entirely from the TOTALS row onwards where the Comments Box occupies the right-hand columns.
6. Calls `has_content` on each remaining cell and collects non-empty ones with their `(row, col)` positions.
7. Calls `recognize_batch` on that filtered list.
8. Places each recognised string back into a 29-row grid; hardcoded footer values are then merged in on top.
9. Maps each row to a dict using the field names the TypeScript front-end expects: `clientName`, `clientId`, `weekEnding1`, `weekEnding2`, `nightHours`, `sundayHours`, `bankHolidayHours`.

---

## Why this approach

The timesheet always has the same printed grid. Knowing the grid structure is fixed lets us use **layout-first** OCR: detect the printed lines first, extract each cell as a separate image, then run a handwriting recogniser on each cell independently. This is more robust than feeding the whole page to a general-purpose OCR engine because:

- The grid detection is scale-invariant (works regardless of scan resolution).
- Deskewing corrects scanner placement angle before any text recognition happens.
- Adaptive thresholding handles uneven scan brightness.
- Isolating each cell removes surrounding context that could confuse the recogniser.
- TrOCR was fine-tuned specifically on handwritten English text (IAM dataset), so it handles cursive and printed handwriting well.
