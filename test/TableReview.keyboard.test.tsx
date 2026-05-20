import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TableReview } from '@/components/TableReview';
import type { OcrResult } from '@/lib/types';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const { unoptimized: _, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

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

describe('TableReview – keyboard navigation', () => {
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
