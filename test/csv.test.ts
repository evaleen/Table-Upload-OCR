import { describe, it, expect } from 'vitest';
import { toCSV } from '@/lib/csv';
import { COLUMN_HEADERS } from '@/lib/types';

const emptyRow = {
  clientName: '',
  clientId: '',
  weekEnding1: '',
  weekEnding2: '',
  nightHours: '',
  sundayHours: '',
  bankHolidayHours: '',
};

describe('toCSV', () => {
  it('produces the correct header row', () => {
    const csv = toCSV({ rows: [] });
    expect(csv).toBe(COLUMN_HEADERS.join(','));
  });

  it('produces one data row per entry', () => {
    const csv = toCSV({ rows: [emptyRow, emptyRow] });
    expect(csv.split('\n')).toHaveLength(3); // header + 2 rows
  });

  it('places values in the correct column order', () => {
    const row = {
      ...emptyRow,
      clientName: 'Jane Doe',
      clientId: '12345',
      nightHours: '3',
    };
    const lines = toCSV({ rows: [row] }).split('\n');
    const cells = lines[1].split(',');
    expect(cells[0]).toBe('Jane Doe');
    expect(cells[1]).toBe('12345');
    expect(cells[4]).toBe('3'); // nightHours is col index 4
  });

  it('wraps values containing commas in double quotes', () => {
    const row = { ...emptyRow, clientName: 'Smith, John' };
    const csv = toCSV({ rows: [row] });
    expect(csv).toContain('"Smith, John"');
  });

  it('escapes double quotes inside quoted values', () => {
    const row = { ...emptyRow, clientName: 'She said "hello"' };
    const csv = toCSV({ rows: [row] });
    expect(csv).toContain('"She said ""hello"""');
  });

  it('wraps values containing newlines in double quotes', () => {
    const row = { ...emptyRow, clientName: 'line1\nline2' };
    const csv = toCSV({ rows: [row] });
    expect(csv).toContain('"line1\nline2"');
  });
});
