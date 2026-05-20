import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TableReview } from '@/components/TableReview';
import { emptyRow, makeResult } from './TableReview.helpers';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const { unoptimized: _, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

const defaultProps = {
  result: makeResult(),
  imageUrl: 'blob:http://localhost/fake',
  onRestart: vi.fn(),
};

describe('TableReview – editing', () => {
  it('renders editable cells as inputs', () => {
    render(<TableReview {...defaultProps} />);
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

describe('TableReview – read-only footer cells', () => {
  it('renders hardcoded clientName cells as spans, not inputs', () => {
    const result = makeResult();
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

  it('renders TOTALS clientName as a span', () => {
    const result = makeResult();
    result.rows[25] = { ...emptyRow, clientName: 'TOTALS', clientId: '' };
    render(<TableReview {...defaultProps} result={result} />);
    expect(screen.getByText('TOTALS').tagName).toBe('SPAN');
  });
});

describe('TableReview – Restart button', () => {
  it('calls onRestart when clicked', async () => {
    const onRestart = vi.fn();
    const user = userEvent.setup();
    render(<TableReview {...defaultProps} onRestart={onRestart} />);
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(onRestart).toHaveBeenCalledOnce();
  });
});
