/**
 * Generic CSV Export Utility
 *
 * Generates RFC 4180-compliant CSV from arrays of records.
 * Handles escaping of special characters (commas, quotes, newlines).
 */

export interface CsvExportOptions {
  /** Column definitions. If omitted, all keys from the first record are used. */
  columns?: CsvColumn[];
  /** Whether to include a header row. Default: true. */
  includeHeader?: boolean;
  /** Delimiter character. Default: comma. */
  delimiter?: string;
  /** Line ending. Default: \r\n (RFC 4180). */
  lineEnding?: string;
}

export interface CsvColumn {
  /** Object key to extract the value from. */
  key: string;
  /** Header label. Defaults to the key. */
  header?: string;
  /** Optional formatter for the value. */
  format?: (value: unknown) => string;
}

/**
 * Escapes a CSV field value per RFC 4180.
 * Fields containing commas, double quotes, or newlines are quoted.
 */
function escapeField(value: unknown, delimiter: string): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports an array of records to a CSV string.
 *
 * @param records - Array of objects to export
 * @param options - Export configuration
 * @returns RFC 4180-compliant CSV string
 */
export function exportToCsv(
  records: Record<string, unknown>[],
  options: CsvExportOptions = {},
): string {
  const {
    includeHeader = true,
    delimiter = ',',
    lineEnding = '\r\n',
  } = options;

  if (records.length === 0) return '';

  const columns: CsvColumn[] = options.columns ??
    Object.keys(records[0]).map((key) => ({ key, header: key }));

  const lines: string[] = [];

  if (includeHeader) {
    const headerLine = columns
      .map((col) => escapeField(col.header ?? col.key, delimiter))
      .join(delimiter);
    lines.push(headerLine);
  }

  for (const record of records) {
    const row = columns
      .map((col) => {
        const raw = record[col.key];
        const value = col.format ? col.format(raw) : raw;
        return escapeField(value, delimiter);
      })
      .join(delimiter);
    lines.push(row);
  }

  return lines.join(lineEnding) + lineEnding;
}

/**
 * Returns the appropriate Content-Type header for CSV downloads.
 */
export function getCsvContentType(): string {
  return 'text/csv; charset=utf-8';
}

/**
 * Generates a Content-Disposition header for file downloads.
 *
 * @param filename - The suggested filename for the download
 */
export function getCsvContentDisposition(filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `attachment; filename="${safeName}"`;
}
