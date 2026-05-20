@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Single-page web application that accepts a scanned image of a timesheet, runs OCR to extract handwritten cell contents, displays the results for user verification in an editable table, and allows export as CSV.

## Expected Table Format

The input image is always a timesheet with a fixed **7-column** printed grid. The first row contains pre-printed column headers (not OCR'd). Data rows beneath contain handwritten values.

| Field key | Column header |
|---|---|
| `clientName` | Client Name |
| `clientId` | Client ID |
| `weekEnding1` | Week Ending |
| `weekEnding2` | Week Ending |
| `nightHours` | Night Hours (8pm–8am) |
| `sundayHours` | Sunday Hours |
| `bankHolidayHours` | Bank Holiday Hours |

Scans may vary in resolution, brightness, and may have slight rotational skew.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **TanStack Query** (`@tanstack/react-query`) — manages the OCR mutation and loading/error state
- **Tailwind CSS v4** — all styling (configured via CSS `@theme` directives, no `tailwind.config.js`)
- **Python 3.12 FastAPI sidecar** — OCR backend (OpenCV grid detection + TrOCR handwriting recognition)

## App Flow

Two screens, managed by a single state variable in the root page component:

1. **Upload screen** — drag-and-drop or click file input (PNG/JPG, max 20 MB); shows a spinner while OCR runs
2. **Review screen** — extracted rows in an editable table; Download CSV and Restart buttons

Restart resets state back to the upload screen. No routing — both screens live in `app/page.tsx`.

## Architecture

```
app/
  page.tsx              # Root page; owns screen state (upload | review)
  layout.tsx            # Wraps children in QueryClientProvider via Providers
  providers.tsx         # TanStack Query QueryClientProvider (client component)
  api/
    ocr/
      route.ts          # POST handler: proxies image to Python OCR service, returns OcrResult
components/
  FileUploader.tsx      # Upload screen: drag-and-drop or click, shows loading while OCR runs
  TableReview.tsx       # Review screen: editable table + image panel + lightbox + CSV download
lib/
  csv.ts                # Converts OcrResult to CSV string
  types.ts              # Shared TypeScript types (TableRow, OcrResult, AppScreen, COLUMN_HEADERS, FOOTER_READONLY)
python/
  server.py             # FastAPI app: OpenCV grid detection → TrOCR → OcrResult JSON
  requirements.txt      # Python dependencies
  README.md             # Detailed explanation of the OCR pipeline and each function
  tests/                # pytest suite: test_pure_functions.py, test_api.py
  venv/                 # Python 3.12 virtual environment (not committed)
test/                   # Vitest suite: FileUploader, TableReview, ocr-route, csv
```

## Key Types (`lib/types.ts`)

```ts
export const COLUMN_HEADERS = [
  'Client Name', 'Client ID', 'Week Ending', 'Week Ending',
  'Night Hours (8pm–8am)', 'Sunday Hours', 'Bank Holiday Hours',
] as const;

type TableRow = {
  clientName: string; clientId: string;
  weekEnding1: string; weekEnding2: string;
  nightHours: string; sundayHours: string; bankHolidayHours: string;
};

type OcrResult = { rows: TableRow[]; };
type AppScreen = 'upload' | 'review';
```

## OCR Strategy

The Python service (`python/server.py`, port 8000) uses a **layout-first** approach tailored to the fixed-template form:

1. **`preprocess`** — greyscale + adaptive thresholding (handles uneven scan lighting)
2. **`deskew`** — Hough line transform finds near-horizontal lines; image rotated by their median angle
3. **`extract_cell_grid`** — morphological opening isolates horizontal/vertical grid lines; projection sums find line centres; cells are cropped individually
4. **`has_content`** — dark-pixel ratio check (threshold 4%) skips blank cells to avoid unnecessary TrOCR calls
5. **`recognize_batch`** — TrOCR (`microsoft/trocr-base-handwritten`, ~350 MB) reads non-empty cells in batches of 16
6. The first `HEADER_ROWS` (4) detected rows are skipped — the printed column header is tall enough that the detector finds sub-rows within it
7. Exactly `NUM_DATA_ROWS` (29) rows are returned: 21 client rows + 8 pre-printed footer rows; footer labels are hardcoded in `FOOTER_PREPRINTED` rather than OCR'd; cols 3–6 are skipped from the TOTALS row onwards to avoid the embedded Comments Box

The Next.js API route (`app/api/ocr/route.ts`) is a thin proxy that forwards the upload to the Python service and returns the JSON unchanged.

## Development Commands

Two processes must run simultaneously:

```bash
# Terminal 1 — Python OCR service
# First run installs deps and downloads ~350 MB of TrOCR model weights
cd python
source venv/bin/activate
PYTHONUNBUFFERED=1 python server.py   # logs each step; http://localhost:8000

# Terminal 2 — Next.js dev server
npm run dev       # http://localhost:3333

# Other
npm run build     # Production build
npm run lint      # ESLint
```

To use a custom Python service URL: `OCR_SERVICE_URL=http://host:8000/ocr npm run dev`

## Testing

```bash
# Frontend (Vitest + jsdom + React Testing Library)
npm run test:run   # single run, exits with pass/fail
npm run test       # watch mode

# Python (pytest — run from the repo root or python/ directory)
cd python
source venv/bin/activate
python -m pytest tests/ -v
```

## Python environment notes

- Requires **Python 3.12** — PyTorch 2.2.2 (Intel Mac max) has no wheels for Python 3.13+
- Create venv: `python3.12 -m venv python/venv`
- `numpy<2` is pinned — numpy 2.x is incompatible with torch 2.2.2
- `transformers<5` is pinned — v5 requires PyTorch ≥ 2.4, unavailable on Intel Mac
- `import torch` must appear before `from transformers import ...` so transformers can detect PyTorch
