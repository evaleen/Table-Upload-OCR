# Timesheet OCR

Upload a scanned timesheet image, review the extracted handwriting in an editable table, and download the result as a CSV.

## Setup

Two processes must run simultaneously.

### Python OCR service (first-time setup)

```bash
python3.12 -m venv python/venv
source python/venv/bin/activate
pip install -r python/requirements.txt   # downloads ~350 MB of TrOCR weights on first run
```

### Running

```bash
# Terminal 1 — OCR service
source python/venv/bin/activate
PYTHONUNBUFFERED=1 python python/server.py   # http://localhost:8000

# Terminal 2 — Next.js app
npm install
npm run dev   # http://localhost:3333
```

## Tech stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS v4)
- **Python 3.12** — FastAPI + OpenCV grid detection + TrOCR (`microsoft/trocr-base-handwritten`)

See `python/README.md` for a detailed explanation of the OCR pipeline.

## Testing

```bash
# Frontend (Vitest + jsdom + React Testing Library)
npm run test:run   # single run
npm run test       # watch mode

# Python (pytest)
cd python
source venv/bin/activate
python -m pytest tests/ -v
```
