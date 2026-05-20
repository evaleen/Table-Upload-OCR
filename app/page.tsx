'use client';

import { useState } from 'react';
import { FileUploader } from '@/components/FileUploader';
import { TableReview } from '@/components/TableReview';
import type { AppScreen, OcrResult } from '@/lib/types';

export default function Home() {
  const [screen, setScreen] = useState<AppScreen>('upload');
  const [result, setResult] = useState<OcrResult | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  if (screen === 'review' && result && imageUrl) {
    return (
      <TableReview
        result={result}
        imageUrl={imageUrl}
        onRestart={() => {
          URL.revokeObjectURL(imageUrl);
          setImageUrl(null);
          setResult(null);
          setScreen('upload');
        }}
      />
    );
  }

  return (
    <FileUploader
      onSuccess={(data, file) => {
        setImageUrl(URL.createObjectURL(file));
        setResult(data);
        setScreen('review');
      }}
    />
  );
}
