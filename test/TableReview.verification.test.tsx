import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TableReview } from '@/components/TableReview';
import { makeResult } from './TableReview.helpers';

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

function makeNonEmptyResult() {
  return makeResult([{ clientName: 'Test Client' }]);
}

describe('TableReview – row verification', () => {
  it('shows confirm and clear buttons for non-empty rows', () => {
    render(<TableReview {...defaultProps} result={makeNonEmptyResult()} />);
    expect(screen.getByRole('button', { name: 'Confirm row' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear row' })).toBeInTheDocument();
  });

  it('shows no confirm or clear buttons when all rows are empty', () => {
    render(<TableReview {...defaultProps} />);
    expect(screen.queryByRole('button', { name: 'Confirm row' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear row' })).not.toBeInTheDocument();
  });

  it('clicking confirm locks the row and shows the edit button', async () => {
    const user = userEvent.setup();
    render(<TableReview {...defaultProps} result={makeNonEmptyResult()} />);
    await user.click(screen.getByRole('button', { name: 'Confirm row' }));
    expect(screen.queryByRole('button', { name: 'Confirm row' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit row' })).toBeInTheDocument();
  });

  it('clicking edit unlocks the row and restores confirm/clear buttons', async () => {
    const user = userEvent.setup();
    render(<TableReview {...defaultProps} result={makeNonEmptyResult()} />);
    await user.click(screen.getByRole('button', { name: 'Confirm row' }));
    await user.click(screen.getByRole('button', { name: 'Edit row' }));
    expect(screen.getByRole('button', { name: 'Confirm row' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear row' })).toBeInTheDocument();
  });

  it('clicking clear row opens the confirmation modal', async () => {
    const user = userEvent.setup();
    render(<TableReview {...defaultProps} result={makeNonEmptyResult()} />);
    await user.click(screen.getByRole('button', { name: 'Clear row' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Clear this row?')).toBeInTheDocument();
  });

  it('cancelling the modal leaves data unchanged and closes it', async () => {
    const user = userEvent.setup();
    render(<TableReview {...defaultProps} result={makeNonEmptyResult()} />);
    await user.click(screen.getByRole('button', { name: 'Clear row' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Client')).toBeInTheDocument();
  });

  it('confirming the modal clears the row data and closes it', async () => {
    const user = userEvent.setup();
    render(<TableReview {...defaultProps} result={makeNonEmptyResult()} />);
    await user.click(screen.getByRole('button', { name: 'Clear row' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear row' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Test Client')).not.toBeInTheDocument();
  });
});

describe('TableReview – CSV download', () => {
  it('download CSV is disabled when a non-empty row is unconfirmed', () => {
    render(<TableReview {...defaultProps} result={makeNonEmptyResult()} />);
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
  });

  it('download CSV is enabled once all non-empty rows are confirmed', async () => {
    const user = userEvent.setup();
    render(<TableReview {...defaultProps} result={makeNonEmptyResult()} />);
    await user.click(screen.getByRole('button', { name: 'Confirm row' }));
    expect(screen.getByRole('button', { name: 'Download CSV' })).not.toBeDisabled();
  });

  it('download CSV is enabled when all rows are empty', () => {
    render(<TableReview {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Download CSV' })).not.toBeDisabled();
  });
});
