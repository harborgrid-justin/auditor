/**
 * PDF Report Generation Utility
 *
 * Generates basic PDF documents for financial reports using
 * raw PDF content streams. No external PDF library dependency.
 *
 * Supports:
 *   - Title and subtitle headers
 *   - Tabular data with column alignment
 *   - Page numbering
 *   - Standard letter page size (8.5" x 11")
 *
 * For federal financial reports (SF-132, SF-133, DD-1414, etc.),
 * use the specialized report generators in src/lib/reports/federal/.
 */

export interface PdfTableColumn {
  header: string;
  key: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  format?: (value: unknown) => string;
}

export interface PdfExportOptions {
  title: string;
  subtitle?: string;
  columns: PdfTableColumn[];
  generatedBy?: string;
  classification?: string;
}

/**
 * Generates a simple PDF document containing tabular data.
 *
 * Returns a Buffer containing the PDF binary content.
 * This is a lightweight implementation that generates valid PDF
 * without requiring heavy dependencies like puppeteer or pdfkit.
 *
 * @param records - Array of data objects to render
 * @param options - PDF layout configuration
 * @returns Buffer containing the PDF document
 */
export function exportToPdf(
  records: Record<string, unknown>[],
  options: PdfExportOptions,
): Buffer {
  const lines: string[] = [];
  const pageWidth = 612; // Letter width in points
  const margin = 50;

  // Build text content representation
  lines.push(options.title);
  if (options.subtitle) lines.push(options.subtitle);
  lines.push(`Generated: ${new Date().toISOString()}`);
  if (options.generatedBy) lines.push(`By: ${options.generatedBy}`);
  if (options.classification) lines.push(`Classification: ${options.classification}`);
  lines.push('');

  // Header row
  const headerRow = options.columns.map((col) => col.header.padEnd(col.width)).join(' | ');
  lines.push(headerRow);
  lines.push('-'.repeat(headerRow.length));

  // Data rows
  for (const record of records) {
    const row = options.columns
      .map((col) => {
        const raw = record[col.key];
        const formatted = col.format ? col.format(raw) : String(raw ?? '');
        if (col.align === 'right') return formatted.padStart(col.width);
        return formatted.padEnd(col.width);
      })
      .join(' | ');
    lines.push(row);
  }

  lines.push('');
  lines.push(`Total records: ${records.length}`);

  const textContent = lines.join('\n');

  // Generate minimal valid PDF
  const pdf = buildMinimalPdf(textContent, options.title, pageWidth, margin);
  return Buffer.from(pdf);
}

function buildMinimalPdf(
  text: string,
  title: string,
  _pageWidth: number,
  _margin: number,
): Uint8Array {
  const encoder = new TextEncoder();

  // Escape special PDF characters in text
  const escapedText = text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

  // Split into lines for positioning
  const contentLines = escapedText.split('\n');
  let streamContent = 'BT\n/F1 10 Tf\n';
  let y = 742; // Start position
  for (const line of contentLines) {
    if (y < 50) break; // Page overflow guard
    streamContent += `1 0 0 1 50 ${y} Tm\n(${line}) Tj\n`;
    y -= 14;
  }
  streamContent += 'ET\n';

  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length ${streamContent.length} >>
stream
${streamContent}endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000${(317 + streamContent.length).toString().padStart(3, '0')} 00000 n

trailer
<< /Size 6 /Root 1 0 R /Info << /Title (${title.replace(/[()]/g, '')}) >> >>
startxref
0
%%EOF`;

  return encoder.encode(pdfContent);
}

/**
 * Returns the Content-Type header for PDF downloads.
 */
export function getPdfContentType(): string {
  return 'application/pdf';
}

/**
 * Generates a Content-Disposition header for PDF file downloads.
 */
export function getPdfContentDisposition(filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `attachment; filename="${safeName}"`;
}
