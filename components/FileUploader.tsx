'use client';

import { useMutation } from '@tanstack/react-query';
import Image from 'next/image';
import { useRef, useState } from 'react';
import type { OcrResult } from '@/lib/types';

async function uploadImage(file: File): Promise<OcrResult> {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch('/api/ocr', { method: 'POST', body: form });
  if (!res.ok) throw new Error('OCR failed');
  return res.json();
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg'];
const ACCEPTED_LABEL = 'PNG or JPG';

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `Invalid file type "${file.type || 'unknown'}". Please upload a ${ACCEPTED_LABEL} file.`;
  }
  if (file.size > 20 * 1024 * 1024) {
    return 'File is too large. Maximum size is 20 MB.';
  }
  return null;
}

export function FileUploader({ onSuccess }: { onSuccess: (result: OcrResult) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation({ mutationFn: uploadImage, onSuccess });

  const handleFile = (file: File) => {
    const error = validateFile(file);
    if (error) {
      setValidationError(error);
      setPreview(null);
      return;
    }
    setValidationError(null);
    setPreview(URL.createObjectURL(file));
    mutation.mutate(file);
  };

  const isError = validationError || mutation.isError;
  const errorMessage = validationError ?? 'OCR failed. Please try again.';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="max-w-lg w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">OCR Table Upload</h1>
        <p className="text-gray-500 text-center mb-8">
          Upload your image to extract its contents:
        </p>

        <div
          role="button"
          tabIndex={0}
          aria-label="Upload image"
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            mutation.isPending
              ? 'border-blue-300 bg-blue-50 pointer-events-none'
              : isError
              ? 'border-red-300 bg-red-50 hover:border-red-400'
              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          }`}
          onClick={() => {
            if (!mutation.isPending) {
              setValidationError(null);
              mutation.reset();
              inputRef.current?.click();
            }
          }}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          {mutation.isPending ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-blue-600 font-medium">Running OCR…</p>
            </div>
          ) : preview && !isError ? (
            <Image
              src={preview}
              alt="Selected image preview"
              width={400}
              height={192}
              className="max-h-48 mx-auto mb-4 rounded object-contain"
              unoptimized
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-lg font-medium">Drop an image here or click to browse</p>
              <p className="text-sm">{ACCEPTED_LABEL} only · max 20 MB</p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/png, image/jpeg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </div>

        {isError && (
          <p className="mt-4 text-red-600 text-center text-sm">{errorMessage}</p>
        )}
      </div>
    </main>
  );
}
