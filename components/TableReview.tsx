'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import Image from 'next/image';
import { toCSV } from '@/lib/csv';
import { COLUMN_HEADERS, FOOTER_READONLY } from '@/lib/types';
import { CheckCircle, XCircle, Pencil } from 'lucide-react';
import type { OcrResult, TableRow } from '@/lib/types';

const columnHelper = createColumnHelper<TableRow>();

const FIELDS: (keyof TableRow)[] = [
  'clientName',
  'clientId',
  'weekEnding1',
  'weekEnding2',
  'nightHours',
  'sundayHours',
  'bankHolidayHours',
];

const NUM_COLS = FIELDS.length;

type RowStatus = 'unreviewed' | 'confirmed';

export function TableReview({
  result,
  imageUrl,
  onRestart,
}: {
  result: OcrResult;
  imageUrl: string;
  onRestart: () => void;
}) {
  "use no memo";
  const [rows, setRows] = useState<TableRow[]>(result.rows);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [rowStatuses, setRowStatuses] = useState<RowStatus[]>(() =>
    Array(result.rows.length).fill('unreviewed')
  );
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);
  // Synced refs give stale useMemo([]) closures access to current state values.
  const rowStatusesRef = useRef(rowStatuses);
  rowStatusesRef.current = rowStatuses;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const handleKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number,
  ) => {
    let dr = 0, dc = 0;
    if      (e.key === 'ArrowUp')    dr = -1;
    else if (e.key === 'ArrowDown')  dr =  1;
    else if (e.key === 'ArrowLeft')  dc = -1;
    else if (e.key === 'ArrowRight') dc =  1;
    else return;

    e.preventDefault();

    const numRows = inputRefs.current.length;
    let nextRow = rowIndex + dr;
    let nextCol = colIndex + dc;

    while (nextRow >= 0 && nextRow < numRows && nextCol >= 0 && nextCol < NUM_COLS) {
      const el = inputRefs.current[nextRow]?.[nextCol];
      if (el) { el.focus(); return; }
      nextRow += dr;
      nextCol += dc;
    }
  }, []);

  // A row is reviewable only if at least one editable (non-readonly) cell is non-empty.
  // Footer rows whose only content is pre-printed labels are treated as empty.
  const isRowReviewable = useCallback((rowIndex: number) =>
    FIELDS.some(
      (field) =>
        !(FOOTER_READONLY[rowIndex]?.includes(field)) &&
        rowsRef.current[rowIndex][field] !== ''
    ), []);

  const confirmRow = useCallback((i: number) =>
    setRowStatuses((prev) => prev.map((s, j) => (j === i ? 'confirmed' : s))), []);

  const unlockRow = useCallback((i: number) =>
    setRowStatuses((prev) => prev.map((s, j) => (j === i ? 'unreviewed' : s))), []);

  // Clears only editable fields; preserves pre-printed readonly labels (e.g. "Break Times").
  const clearRow = useCallback((i: number) => {
    setRows((prev) =>
      prev.map((r, j) => {
        if (j !== i) return r;
        const cleared = { ...r };
        for (const field of FIELDS) {
          if (!(FOOTER_READONLY[i]?.includes(field))) cleared[field] = '';
        }
        return cleared;
      })
    );
    setRowStatuses((prev) => prev.map((s, j) => (j === i ? 'unreviewed' : s)));
    setRejectTarget(null);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxOpen]);

  const updateCell = (rowIndex: number, field: keyof TableRow, value: string) =>
    setRows((prev) =>
      prev.map((r, i) => (i === rowIndex ? { ...r, [field]: value } : r))
    );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'actions',
        cell: ({ row }) => {
          const rowIndex = row.index;
          const status = rowStatusesRef.current[rowIndex];
          const reviewable = isRowReviewable(rowIndex);

          if (!reviewable) return <div className="w-16" />;

          if (status === 'confirmed') {
            return (
              <div className="flex items-center justify-center w-16 px-1">
                <button
                  onClick={() => unlockRow(rowIndex)}
                  aria-label="Edit row"
                  title="Edit row"
                  className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <Pencil className="size-4" />
                </button>
              </div>
            );
          }

          return (
            <div className="flex items-center justify-center w-16 gap-0.5 px-1">
              <button
                onClick={() => confirmRow(rowIndex)}
                aria-label="Confirm row"
                title="Confirm row"
                className="p-1 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors cursor-pointer"
              >
                <CheckCircle className="size-4" />
              </button>
              <button
                onClick={() => setRejectTarget(rowIndex)}
                aria-label="Clear row"
                title="Clear row"
                className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <XCircle className="size-4" />
              </button>
            </div>
          );
        },
      }),
      ...FIELDS.map((field, colIndex) =>
        columnHelper.accessor(field, {
          header: COLUMN_HEADERS[colIndex],
          cell: ({ getValue, row }) => {
            const rowIndex = row.index;
            const isReadOnly = FOOTER_READONLY[rowIndex]?.includes(field) ?? false;
            const isConfirmed = rowStatusesRef.current[rowIndex] === 'confirmed';
            const value = getValue();

            if (isReadOnly || isConfirmed) {
              return (
                <span className="block w-full px-3 py-2 text-sm text-gray-500 select-none">
                  {value}
                </span>
              );
            }

            return (
              <input
                ref={(el) => {
                  if (!inputRefs.current[rowIndex]) inputRefs.current[rowIndex] = Array(NUM_COLS).fill(null);
                  inputRefs.current[rowIndex][colIndex] = el;
                }}
                value={value}
                onChange={(e) => updateCell(rowIndex, field, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                className="w-full px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 text-sm"
              />
            );
          },
        })
      ),
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const allConfirmed = rows.every((_, i) => !isRowReviewable(i) || rowStatuses[i] === 'confirmed');

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

  const detectedCount = rows
    .slice(0, 21)
    .filter((r) => Object.values(r).some((v) => v !== '')).length;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="flex flex-col h-screen">
        <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Review Timesheet</h1>
            <p className="text-gray-500 text-sm mt-0.5">Confirm each row before downloading</p>
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
              disabled={!allConfirmed}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Download CSV
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-80 shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Uploaded image</p>
            <Image
              src={imageUrl}
              alt="Uploaded timesheet"
              width={320}
              height={800}
              className="w-full rounded border border-gray-200 object-contain cursor-pointer hover:ring-2 hover:ring-blue-400 transition-shadow"
              unoptimized
              onClick={() => setLightboxOpen(true)}
            />
            <p className="text-xs text-gray-400 mt-2 text-center">Click to enlarge</p>
          </aside>

          {lightboxOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-8"
              onClick={() => setLightboxOpen(false)}
            >
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setLightboxOpen(false)}
                  className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-900 font-medium cursor-pointer"
                  aria-label="Close"
                >
                  ×
                </button>
                <Image
                  src={imageUrl}
                  alt="Uploaded timesheet full size"
                  width={794}
                  height={1123}
                  className="rounded shadow-2xl"
                  unoptimized
                />
              </div>
            </div>
          )}

          {rejectTarget !== null && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div role="dialog" aria-modal="true" className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Clear this row?</h2>
                <p className="text-sm text-gray-500 mb-6">
                  All data in this row will be deleted. This cannot be undone.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setRejectTarget(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => clearRow(rejectTarget)}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    Clear row
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-auto">
            <div className="min-w-max">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-3 py-2 text-left text-sm font-semibold text-gray-700 border-r border-gray-200 last:border-r-0 whitespace-nowrap"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="p-0 border-r border-gray-100 last:border-r-0">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-center text-gray-400 text-sm py-4">{detectedCount} rows detected</p>
          </div>
        </div>
      </div>
    </main>
  );
}
