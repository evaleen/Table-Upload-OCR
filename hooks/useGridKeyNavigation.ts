import { useRef, useCallback } from 'react';

/**
 * Manages keyboard arrow-key navigation across a 2-D grid of inputs.
 *
 * - Call `registerInput(el, row, col)` as the ref callback on each <input>.
 * - Attach `handleKeyDown(e, row, col)` to each input's onKeyDown.
 * - Null slots (read-only or confirmed cells with no <input>) are skipped
 *   automatically; navigation stops at grid boundaries.
 */
export function useGridKeyNavigation(numCols: number) {
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

  const registerInput = useCallback(
    (el: HTMLInputElement | null, rowIndex: number, colIndex: number) => {
      if (!inputRefs.current[rowIndex])
        inputRefs.current[rowIndex] = Array(numCols).fill(null);
      inputRefs.current[rowIndex][colIndex] = el;
    },
    [numCols],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
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

      while (nextRow >= 0 && nextRow < numRows && nextCol >= 0 && nextCol < numCols) {
        const el = inputRefs.current[nextRow]?.[nextCol];
        if (el) { el.focus(); return; }
        nextRow += dr;
        nextCol += dc;
      }
    },
    [numCols],
  );

  return { registerInput, handleKeyDown };
}
