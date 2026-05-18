import { COLUMN_HEADERS } from './types';
import type { OcrResult } from './types';

export function toCSV(result: OcrResult): string {
  const lines: string[] = [];
  lines.push(COLUMN_HEADERS.map(escapeCell).join(','));
  for (const row of result.rows) {
    lines.push([
      row.clientName,
      row.clientId,
      row.weekEnding1,
      row.weekEnding2,
      row.nightHours,
      row.sundayHours,
      row.bankHolidayHours,
    ].map(escapeCell).join(','));
  }
  return lines.join('\n');
}

function escapeCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
