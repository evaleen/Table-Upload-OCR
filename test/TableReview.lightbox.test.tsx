import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('TableReview – lightbox', () => {
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
