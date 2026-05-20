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

export const FIELDS: (keyof TableRow)[] = [
  'clientName',
  'clientId',
  'weekEnding1',
  'weekEnding2',
  'nightHours',
  'sundayHours',
  'bankHolidayHours',
];

export const NUM_COLS = FIELDS.length;

export const FOOTER_READONLY: Partial<Record<number, (keyof TableRow)[]>> = {
  21: ['clientName', 'clientId'],
  22: ['clientName', 'clientId'],
  23: ['clientName', 'clientId'],
  25: ['clientName'],
  26: ['clientName', 'clientId'],
  27: ['clientName', 'clientId'],
  28: ['clientName'],
};
