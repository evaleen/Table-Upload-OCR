'use client';

import { useEffect } from 'react';
import Image from 'next/image';

export function ImageLightbox({
  src,
  isOpen,
  onClose,
}: {
  src: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-8"
      onClick={onClose}
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-900 font-medium cursor-pointer"
        >
          ×
        </button>
        <Image
          src={src}
          alt="Uploaded timesheet full size"
          width={794}
          height={1123}
          className="rounded shadow-2xl"
          unoptimized
        />
      </div>
    </div>
  );
}
