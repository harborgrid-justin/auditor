import Papa from 'papaparse';

export interface ParseResult {
  data: Record<string, string>[];
  errors: string[];
  headers: string[];
}

export function parseCSV(content: string): ParseResult {
  const errors: string[] = [];

  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h: string) => h.trim(),
  });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      errors.push(`Row ${err.row}: ${err.message}`);
    }
  }

  const headers = result.meta.fields || [];
  const data = (result.data as Record<string, string>[]).filter(row => {
    return Object.values(row).some(v => v && v.toString().trim() !== '');
  });

  return { data, errors, headers };
}
