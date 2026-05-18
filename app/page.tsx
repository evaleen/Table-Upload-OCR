'use client';

import { useState } from 'react';
import { FileUploader } from '@/components/FileUploader';
import { TableReview } from '@/components/TableReview';
import type { AppScreen, OcrResult } from '@/lib/types';

export default function Home() {
  const [screen, setScreen] = useState<AppScreen>('upload');
  const [result, setResult] = useState<OcrResult | null>(null);

  if (screen === 'review' && result) {
    return (
      <TableReview
        result={result}
        onRestart={() => {
          setResult(null);
          setScreen('upload');
        }}
      />
    );
  }

  return (
    <FileUploader
      onSuccess={(data) => {
        setResult(data);
        setScreen('review');
      }}
    />
  );
}
