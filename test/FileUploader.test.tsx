import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileUploader } from '@/components/FileUploader';
import type { OcrResult } from '@/lib/types';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const { unoptimized: _, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

// jsdom doesn't implement URL.createObjectURL
vi.stubGlobal('URL', {
  ...URL,
  createObjectURL: vi.fn(() => 'blob:http://localhost/fake'),
  revokeObjectURL: vi.fn(),
});

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  const blob = new Blob(['x'.repeat(sizeBytes)], { type });
  return new File([blob], name, { type });
}

// userEvent.upload skips hidden inputs; use fireEvent.change with a real FileList instead.
function uploadToInput(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function renderUploader(onSuccess = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FileUploader onSuccess={onSuccess} />
    </QueryClientProvider>
  );
}

const fakeResult: OcrResult = {
  rows: [],
};

describe('FileUploader', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initial render', () => {
    it('shows the upload prompt', () => {
      renderUploader();
      expect(screen.getByText('Drop an image here or click to browse')).toBeInTheDocument();
      expect(screen.getByText(/PNG or JPG/)).toBeInTheDocument();
    });

    it('renders the upload zone as a button', () => {
      renderUploader();
      expect(screen.getByRole('button', { name: 'Upload image' })).toBeInTheDocument();
    });
  });

  describe('file type validation', () => {
    it('shows an error for unsupported file types', () => {
      renderUploader();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      uploadToInput(input, makeFile('doc.pdf', 'application/pdf'));
      expect(screen.getByText(/Invalid file type/)).toBeInTheDocument();
    });

    it('does not call fetch for invalid file types', () => {
      renderUploader();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      uploadToInput(input, makeFile('doc.pdf', 'application/pdf'));
      expect(fetch).not.toHaveBeenCalled();
    });

    it('accepts PNG files without an error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(fakeResult), { status: 200 })
      );
      renderUploader();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      uploadToInput(input, makeFile('sheet.png', 'image/png'));
      expect(screen.queryByText(/Invalid file type/)).not.toBeInTheDocument();
    });

    it('accepts JPEG files without an error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(fakeResult), { status: 200 })
      );
      renderUploader();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      uploadToInput(input, makeFile('sheet.jpg', 'image/jpeg'));
      expect(screen.queryByText(/Invalid file type/)).not.toBeInTheDocument();
    });
  });

  describe('file size validation', () => {
    it('shows an error when the file exceeds 20 MB', () => {
      renderUploader();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      uploadToInput(input, makeFile('huge.png', 'image/png', 21 * 1024 * 1024));
      expect(screen.getByText('File is too large. Maximum size is 20 MB.')).toBeInTheDocument();
    });

    it('does not call fetch when the file is too large', () => {
      renderUploader();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      uploadToInput(input, makeFile('huge.png', 'image/png', 21 * 1024 * 1024));
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('successful upload', () => {
    it('shows a spinner while the request is in flight', async () => {
      let resolve!: (v: Response) => void;
      vi.mocked(fetch).mockReturnValueOnce(new Promise((r) => (resolve = r)));
      renderUploader();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      uploadToInput(input, makeFile('sheet.png', 'image/png'));
      expect(screen.getByText('Running OCR…')).toBeInTheDocument();
      resolve(new Response(JSON.stringify(fakeResult), { status: 200 }));
    });

    it('calls onSuccess with the result and the uploaded file', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(fakeResult), { status: 200 })
      );
      const onSuccess = vi.fn();
      renderUploader(onSuccess);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = makeFile('sheet.png', 'image/png');
      uploadToInput(input, file);
      await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
      const [result, passedFile] = onSuccess.mock.calls[0];
      expect(result).toEqual(fakeResult);
      expect(passedFile).toBe(file);
    });
  });

  describe('failed upload', () => {
    it('shows an error message when the server returns a non-ok status', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
      renderUploader();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      uploadToInput(input, makeFile('sheet.png', 'image/png'));
      await waitFor(() =>
        expect(screen.getByText('OCR failed. Please try again.')).toBeInTheDocument()
      );
    });
  });

  describe('drag and drop', () => {
    it('shows a validation error when an invalid file is dropped', () => {
      renderUploader();
      const zone = screen.getByRole('button', { name: 'Upload image' });
      fireEvent.drop(zone, {
        dataTransfer: { files: [makeFile('doc.pdf', 'application/pdf')] },
      });
      expect(screen.getByText(/Invalid file type/)).toBeInTheDocument();
    });
  });
});
