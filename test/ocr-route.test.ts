import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/ocr/route';

// Construct a minimal NextRequest-shaped object — the route only calls
// request.formData(), so we don't need a real Request instance.
function makeRequest(file?: File): any {
  const form = new FormData();
  if (file) form.append('image', file);
  return { formData: async () => form };
}

function makeFile(name = 'sheet.png', type = 'image/png'): File {
  return new File(['data'], name, { type });
}

const fakeOcrResult = { rows: [{ clientName: 'Test', clientId: '12345', weekEnding1: '', weekEnding2: '', nightHours: '', sundayHours: '', bankHolidayHours: '' }] };

describe('POST /api/ocr', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 400 when no image field is provided', async () => {
    const res = await POST(makeRequest() as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'No image provided' });
  });

  it('returns 502 when the OCR service responds with a non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    const res = await POST(makeRequest(makeFile()) as any);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: 'OCR service unavailable' });
  });

  it('proxies the OCR service JSON response on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(fakeOcrResult), { status: 200 })
    );
    const res = await POST(makeRequest(makeFile()) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(fakeOcrResult);
  });

  it('forwards the request to the OCR service URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(fakeOcrResult), { status: 200 })
    );
    await POST(makeRequest(makeFile()) as any);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/ocr',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
