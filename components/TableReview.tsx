'use client';

import { useState, useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import Image from 'next/image';
import { toCSV } from '@/lib/csv';
import { COLUMN_HEADERS, FOOTER_READONLY, FIELDS, NUM_COLS } from '@/lib/types';
import { CheckCircle, XCircle, Pencil } from 'lucide-react';
import type { OcrResult, TableRow } from '@/lib/types';
import { useGridKeyNavigation } from '@/hooks/useGridKeyNavigation';
import { useRowReview } from '@/hooks/useRowReview';
import { ImageLightbox } from './ImageLightbox';
import { ClearRowModal } from './ClearRowModal';

const columnHelper = createColumnHelper<TableRow>();

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

  const { registerInput, handleKeyDown } = useGridKeyNavigation(NUM_COLS);
  const {
    rowStatusesRef,
    rejectTarget,
    setRejectTarget,
    isRowReviewable,
    confirmRow,
    unlockRow,
    clearRow,
    allConfirmed,
  } = useRowReview(rows, setRows);

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
                ref={(el) => registerInput(el, rowIndex, colIndex)}
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

          <ImageLightbox
            src={imageUrl}
            isOpen={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
          />

          <ClearRowModal
            isOpen={rejectTarget !== null}
            onCancel={() => setRejectTarget(null)}
            onConfirm={() => rejectTarget !== null && clearRow(rejectTarget)}
          />

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
