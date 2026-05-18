'use client';

import { useState } from 'react';
import { toCSV } from '@/lib/csv';
import { COLUMN_HEADERS } from '@/lib/types';
import type { OcrResult, TableRow } from '@/lib/types';

export function TableReview({
  result,
  onRestart,
}: {
  result: OcrResult;
  onRestart: () => void;
}) {
  const [rows, setRows] = useState<TableRow[]>(result.rows);

  const updateCell = (rowIndex: number, field: keyof TableRow, value: string) =>
    setRows((prev) =>
      prev.map((r, i) => (i === rowIndex ? { ...r, [field]: value } : r))
    );

  const downloadCSV = () => {
    const csv = toCSV({ rows });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timesheet.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const cellClass =
    'w-full px-3 py-2 bg-transparent border-r border-gray-100 last:border-r-0 focus:outline-none focus:bg-blue-50 text-sm';

  const fields: (keyof TableRow)[] = [
    'clientName',
    'clientId',
    'weekEnding1',
    'weekEnding2',
    'nightHours',
    'sundayHours',
    'bankHolidayHours',
  ];

  return (
    <main className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Review Timesheet</h1>
            <p className="text-gray-500 text-sm mt-1">Click any cell to correct OCR mistakes</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onRestart}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Restart
            </button>
            <button
              onClick={downloadCSV}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Download CSV
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {COLUMN_HEADERS.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left text-sm font-semibold text-gray-700 border-r border-gray-200 last:border-r-0 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                  {fields.map((field) => (
                    <td key={field} className="p-0">
                      <input
                        value={row[field]}
                        onChange={(e) => updateCell(ri, field, e.target.value)}
                        className={cellClass}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-gray-400 text-sm mt-4">
          {rows.slice(0, 21).filter((r) => Object.values(r).some((v) => v !== '')).length} rows detected
        </p>
      </div>
    </main>
  );
}
