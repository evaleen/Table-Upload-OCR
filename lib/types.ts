export const COLUMN_HEADERS = [
  'Client Name',
  'Client ID',
  'Week Ending',
  'Week Ending',
  'Night Hours (8pm–8am)',
  'Sunday Hours',
  'Bank Holiday Hours',
] as const;

export type TableRow = {
  clientName: string;
  clientId: string;
  weekEnding1: string;
  weekEnding2: string;
  nightHours: string;
  sundayHours: string;
  bankHolidayHours: string;
};

export type OcrResult = {
  rows: TableRow[];
};

export type AppScreen = 'upload' | 'review';
