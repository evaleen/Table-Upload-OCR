import { useState, useRef, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { FIELDS, FOOTER_READONLY } from '@/lib/types';
import type { TableRow } from '@/lib/types';

export type RowStatus = 'unreviewed' | 'confirmed';

export function useRowReview(
  rows: TableRow[],
  setRows: Dispatch<SetStateAction<TableRow[]>>,
) {
  const [rowStatuses, setRowStatuses] = useState<RowStatus[]>(() =>
    Array(rows.length).fill('unreviewed'),
  );
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);

  // Synced refs let stale useMemo([]) closures in the parent read current values.
  const rowStatusesRef = useRef(rowStatuses);
  const rowsRef = useRef(rows);
  useEffect(() => { rowStatusesRef.current = rowStatuses; });
  useEffect(() => { rowsRef.current = rows; });

  // A row is reviewable if at least one editable (non-readonly) cell is non-empty.
  // Footer rows whose only content is pre-printed labels are treated as empty.
  const isRowReviewable = useCallback(
    (rowIndex: number) =>
      FIELDS.some(
        (field) =>
          !(FOOTER_READONLY[rowIndex]?.includes(field)) &&
          rowsRef.current[rowIndex][field] !== '',
      ),
    [],
  );

  const confirmRow = useCallback(
    (i: number) => setRowStatuses((prev) => prev.map((s, j) => (j === i ? 'confirmed' : s))),
    [],
  );

  const unlockRow = useCallback(
    (i: number) => setRowStatuses((prev) => prev.map((s, j) => (j === i ? 'unreviewed' : s))),
    [],
  );

  // Clears only editable fields; preserves pre-printed readonly labels (e.g. "Break Times").
  const clearRow = useCallback(
    (i: number) => {
      setRows((prev) =>
        prev.map((r, j) => {
          if (j !== i) return r;
          const cleared = { ...r };
          for (const field of FIELDS) {
            if (!(FOOTER_READONLY[i]?.includes(field))) cleared[field] = '';
          }
          return cleared;
        }),
      );
      setRowStatuses((prev) => prev.map((s, j) => (j === i ? 'unreviewed' : s)));
      setRejectTarget(null);
    },
    [setRows],
  );

  const allConfirmed = rows.every((row, i) => {
    const hasEditableContent = FIELDS.some(
      (field) => !(FOOTER_READONLY[i]?.includes(field)) && row[field] !== '',
    );
    return !hasEditableContent || rowStatuses[i] === 'confirmed';
  });

  return {
    rowStatusesRef,
    rejectTarget,
    setRejectTarget,
    isRowReviewable,
    confirmRow,
    unlockRow,
    clearRow,
    allConfirmed,
  };
}
