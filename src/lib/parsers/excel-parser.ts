import * as XLSX from 'xlsx';

export interface ParseResult {
  data: Record<string, string>[];
  errors: string[];
  headers: string[];
  sheetNames: string[];
}

export function parseExcel(buffer: Buffer, sheetName?: string): ParseResult {
  const errors: string[] = [];

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;

    const targetSheet = sheetName || sheetNames[0];
    if (!targetSheet || !workbook.Sheets[targetSheet]) {
      return { data: [], errors: ['No sheets found in workbook'], headers: [], sheetNames };
    }

    const sheet = workbook.Sheets[targetSheet];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });

    const data = jsonData.map(row => {
      const converted: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        converted[key.trim()] = String(value ?? '').trim();
      }
      return converted;
    }).filter(row => Object.values(row).some(v => v !== ''));

    const headers = data.length > 0 ? Object.keys(data[0]) : [];

    return { data, errors, headers, sheetNames };
  } catch (error) {
    return {
      data: [],
      errors: [`Failed to parse Excel file: ${(error as Error).message}`],
      headers: [],
      sheetNames: [],
    };
  }
}
