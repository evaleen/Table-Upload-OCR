import type { OcrResult } from '@/lib/types';

export const emptyRow = {
  clientName: '',
  clientId: '',
  weekEnding1: '',
  weekEnding2: '',
  nightHours: '',
  sundayHours: '',
  bankHolidayHours: '',
};

export function makeResult(overrides: Partial<typeof emptyRow>[] = []): OcrResult {
  const rows = Array.from({ length: 29 }, (_, i) => ({
    ...emptyRow,
    ...(overrides[i] ?? {}),
  }));
  return { rows };
}
