import { NextRequest } from 'next/server';

const OCR_SERVICE = process.env.OCR_SERVICE_URL ?? 'http://localhost:8000/ocr';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('image');

  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: 'No image provided' }, { status: 400 });
  }

  const proxy = new FormData();
  proxy.append('image', file);

  const res = await fetch(OCR_SERVICE, { method: 'POST', body: proxy });

  if (!res.ok) {
    return Response.json({ error: 'OCR service unavailable' }, { status: 502 });
  }

  return Response.json(await res.json());
}
