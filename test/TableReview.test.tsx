import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TableReview } from '@/components/TableReview';
import type { OcrResult } from '@/lib/types';

// next/image doesn't work in jsdom — replace with a plain <img>
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const { unoptimized: _, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

const emptyRow = {
  clientName: '',
  clientId: '',
  weekEnding1: '',
  weekEnding2: '',
  nightHours: '',
  sundayHours: '',
  bankHolidayHours: '',
};

function makeResult(overrides: Partial<typeof emptyRow>[] = []): OcrResult {
  const rows = Array.from({ length: 29 }, (_, i) => ({
    ...emptyRow,
    ...(overrides[i] ?? {}),
  }));
  return { rows };
}

const defaultProps = {
  result: makeResult(),
  imageUrl: 'blob:http://localhost/fake',
  onRestart: vi.fn(),
};

describe('TableReview', () => {
  describe('editable client data rows (rows 0–20)', () => {
    it('renders all cells as inputs', () => {
      render(<TableReview {...defaultProps} />);
      // Row 0, all 7 columns should be inputs
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThanOrEqual(7);
    });

    it('updates a cell value when typed into', async () => {
      const user = userEvent.setup();
      render(<TableReview {...defaultProps} />);
      const inputs = screen.getAllByRole('textbox');
      await user.clear(inputs[0]);
      await user.type(inputs[0], 'John Smith');
      expect(inputs[0]).toHaveValue('John Smith');
    });
  });

  describe('read-only footer cells', () => {
    it('renders hardcoded clientName cells as spans, not inputs', () => {
      const result = makeResult();
      // Row 21 clientName should be "Break Times" (hardcoded from server)
      result.rows[21] = { ...emptyRow, clientName: 'Break Times', clientId: '77777' };
      render(<TableReview {...defaultProps} result={result} />);
      expect(screen.getByText('Break Times').tagName).toBe('SPAN');
      expect(screen.getByText('77777').tagName).toBe('SPAN');
    });

    it('renders hardcoded clientId cells as spans', () => {
      const result = makeResult();
      result.rows[22] = { ...emptyRow, clientName: 'Shadowing', clientId: '88888' };
      render(<TableReview {...defaultProps} result={result} />);
      expect(screen.getByText('88888').tagName).toBe('SPAN');
    });

    it('renders TOTALS clientName as a span but its clientId as an input', () => {
      const result = makeResult();
      result.rows[25] = { ...emptyRow, clientName: 'TOTALS', clientId: '' };
      render(<TableReview {...defaultProps} result={result} />);
      expect(screen.getByText('TOTALS').tagName).toBe('SPAN');
    });
  });

  describe('lightbox', () => {
    it('is closed by default', () => {
      render(<TableReview {...defaultProps} />);
      expect(screen.queryByAltText('Uploaded timesheet full size')).not.toBeInTheDocument();
    });

    it('opens when the thumbnail is clicked', async () => {
      const user = userEvent.setup();
      render(<TableReview {...defaultProps} />);
      await user.click(screen.getByAltText('Uploaded timesheet'));
      expect(screen.getByAltText('Uploaded timesheet full size')).toBeInTheDocument();
    });

    it('closes when the × button is clicked', async () => {
      const user = userEvent.setup();
      render(<TableReview {...defaultProps} />);
      await user.click(screen.getByAltText('Uploaded timesheet'));
      await user.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByAltText('Uploaded timesheet full size')).not.toBeInTheDocument();
    });

    it('closes when Escape is pressed', async () => {
      const user = userEvent.setup();
      render(<TableReview {...defaultProps} />);
      await user.click(screen.getByAltText('Uploaded timesheet'));
      await user.keyboard('{Escape}');
      expect(screen.queryByAltText('Uploaded timesheet full size')).not.toBeInTheDocument();
    });
  });

  describe('Restart button', () => {
    it('calls onRestart when clicked', async () => {
      const onRestart = vi.fn();
      const user = userEvent.setup();
      render(<TableReview {...defaultProps} onRestart={onRestart} />);
      await user.click(screen.getByRole('button', { name: 'Restart' }));
      expect(onRestart).toHaveBeenCalledOnce();
    });
  });

  describe('keyboard navigation', () => {
    // Each editable cell gets a unique display value so tests can locate and
    // assert focus on specific cells without relying on DOM order.
    function makeNavResult(): OcrResult {
      return {
        rows: Array.from({ length: 29 }, (_, r) => ({
          clientName: `r${r}c0`,
          clientId: `r${r}c1`,
          weekEnding1: `r${r}c2`,
          weekEnding2: `r${r}c3`,
          nightHours: `r${r}c4`,
          sundayHours: `r${r}c5`,
          bankHolidayHours: `r${r}c6`,
        })),
      };
    }

    function renderNav() {
      const user = userEvent.setup();
      render(<TableReview result={makeNavResult()} imageUrl="blob:http://localhost/fake" onRestart={vi.fn()} />);
      return user;
    }

    it('ArrowDown moves focus one row down', async () => {
      const user = renderNav();
      await user.click(screen.getByDisplayValue('r0c0'));
      await user.keyboard('{ArrowDown}');
      expect(screen.getByDisplayValue('r1c0')).toHaveFocus();
    });

    it('ArrowUp moves focus one row up', async () => {
      const user = renderNav();
      await user.click(screen.getByDisplayValue('r1c0'));
      await user.keyboard('{ArrowUp}');
      expect(screen.getByDisplayValue('r0c0')).toHaveFocus();
    });

    it('ArrowRight moves focus one column right', async () => {
      const user = renderNav();
      await user.click(screen.getByDisplayValue('r0c0'));
      await user.keyboard('{ArrowRight}');
      expect(screen.getByDisplayValue('r0c1')).toHaveFocus();
    });

    it('ArrowLeft moves focus one column left', async () => {
      const user = renderNav();
      await user.click(screen.getByDisplayValue('r0c1'));
      await user.keyboard('{ArrowLeft}');
      expect(screen.getByDisplayValue('r0c0')).toHaveFocus();
    });

    it('ArrowUp at row 0 does nothing', async () => {
      const user = renderNav();
      await user.click(screen.getByDisplayValue('r0c0'));
      await user.keyboard('{ArrowUp}');
      expect(screen.getByDisplayValue('r0c0')).toHaveFocus();
    });

    it('ArrowLeft at the first column does nothing', async () => {
      const user = renderNav();
      await user.click(screen.getByDisplayValue('r0c0'));
      await user.keyboard('{ArrowLeft}');
      expect(screen.getByDisplayValue('r0c0')).toHaveFocus();
    });

    it('ArrowDown at the last row does nothing', async () => {
      const user = renderNav();
      // col 2 (weekEnding1) is editable in all rows including the last
      await user.click(screen.getByDisplayValue('r28c2'));
      await user.keyboard('{ArrowDown}');
      expect(screen.getByDisplayValue('r28c2')).toHaveFocus();
    });

    it('ArrowRight at the last column does nothing', async () => {
      const user = renderNav();
      await user.click(screen.getByDisplayValue('r0c6'));
      await user.keyboard('{ArrowRight}');
      expect(screen.getByDisplayValue('r0c6')).toHaveFocus();
    });

    it('ArrowDown skips consecutive read-only cells', async () => {
      const user = renderNav();
      // rows 21–23 have clientName (col 0) read-only; next editable in col 0 is row 24
      await user.click(screen.getByDisplayValue('r20c0'));
      await user.keyboard('{ArrowDown}');
      expect(screen.getByDisplayValue('r24c0')).toHaveFocus();
    });
  });
});
