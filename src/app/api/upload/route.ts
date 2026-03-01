import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { parseCSV } from '@/lib/parsers/csv-parser';
import { parseExcel } from '@/lib/parsers/excel-parser';
import { classifyAccountType } from '@/lib/utils/formatting';
import { requireAuth, requireEngagementMember } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const engagementId = searchParams.get('engagementId');

  if (!engagementId) {
    return NextResponse.json({ files: [] });
  }

  const files = db.select().from(schema.uploadedFiles)
    .where(eq(schema.uploadedFiles.engagementId, engagementId))
    .all();

  return NextResponse.json({ files });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const engagementId = formData.get('engagementId') as string;
    const dataType = formData.get('dataType') as string;

    if (!file || !engagementId || !dataType) {
      return NextResponse.json({ error: 'file, engagementId, and dataType are required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    // File size validation (50MB limit)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 50MB limit' }, { status: 400 });
    }

    const engagement = db.select().from(schema.engagements).where(eq(schema.engagements.id, engagementId)).get();
    if (!engagement) {
      return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name;
    const fileType = fileName.endsWith('.csv') ? 'csv' : fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ? 'excel' : 'other';

    let rows: Record<string, string>[] = [];
    let parseErrors: string[] = [];

    if (fileType === 'csv') {
      const result = parseCSV(buffer.toString('utf-8'));
      rows = result.data;
      parseErrors = result.errors;
    } else if (fileType === 'excel') {
      const result = parseExcel(buffer);
      rows = result.data;
      parseErrors = result.errors;
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Upload CSV or Excel files.' }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data found in file', parseErrors }, { status: 400 });
    }

    // Process based on data type
    let recordCount = 0;

    if (dataType === 'trial_balance') {
      recordCount = processTrialBalance(rows, engagementId, fileName);
    } else if (dataType === 'journal_entries') {
      recordCount = processJournalEntries(rows, engagementId, fileName);
    } else if (dataType === 'tax_returns') {
      recordCount = processTaxData(rows, engagementId);
    } else {
      recordCount = rows.length;
    }

    // Record file upload
    const fileId = uuid();
    db.insert(schema.uploadedFiles).values({
      id: fileId,
      engagementId,
      fileName,
      fileType,
      fileSize: buffer.length,
      dataType: dataType as 'trial_balance' | 'journal_entries' | 'financial_statements' | 'tax_returns' | 'other',
      recordCount,
      status: 'completed',
      uploadedAt: new Date().toISOString(),
      uploadedBy: auth.user.id,
    }).run();

    return NextResponse.json({
      success: true,
      fileId,
      recordCount,
      warnings: parseErrors,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed: ' + (error as Error).message }, { status: 500 });
  }
}

function processTrialBalance(rows: Record<string, string>[], engagementId: string, sourceFile: string): number {
  let count = 0;
  const headers = Object.keys(rows[0] || {}).map(h => h.toLowerCase());

  const acctNumCol = headers.find(h => h.includes('account') && (h.includes('num') || h.includes('#') || h.includes('code'))) || headers.find(h => h.includes('acct')) || headers[0];
  const acctNameCol = headers.find(h => h.includes('account') && h.includes('name')) || headers.find(h => h.includes('description')) || headers[1];
  const debitCol = headers.find(h => h.includes('debit')) || headers.find(h => h.includes('dr'));
  const creditCol = headers.find(h => h.includes('credit')) || headers.find(h => h.includes('cr'));
  const balanceCol = headers.find(h => h.includes('balance') || h.includes('amount'));

  for (const row of rows) {
    const keys = Object.keys(row);
    const acctNum = row[keys.find(k => k.toLowerCase() === acctNumCol) || keys[0]] || '';
    const acctName = row[keys.find(k => k.toLowerCase() === acctNameCol) || keys[1]] || '';

    if (!acctNum && !acctName) continue;

    const debit = parseFloat(row[keys.find(k => k.toLowerCase() === debitCol) || ''] || '0') || 0;
    const credit = parseFloat(row[keys.find(k => k.toLowerCase() === creditCol) || ''] || '0') || 0;
    const balance = balanceCol ? parseFloat(row[keys.find(k => k.toLowerCase() === balanceCol) || ''] || '0') || 0 : debit - credit;

    const { accountType, subType } = classifyAccountType(acctNum, acctName);

    const accountId = uuid();
    db.insert(schema.accounts).values({
      id: accountId,
      engagementId,
      accountNumber: acctNum.trim(),
      accountName: acctName.trim(),
      accountType: accountType as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
      subType,
      beginningBalance: 0,
      endingBalance: balance,
      period: new Date().toISOString().slice(0, 7),
    }).run();

    db.insert(schema.trialBalanceEntries).values({
      id: uuid(),
      engagementId,
      accountId,
      debit,
      credit,
      period: new Date().toISOString().slice(0, 7),
      sourceFile,
    }).run();

    count++;
  }

  return count;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function processJournalEntries(rows: Record<string, string>[], engagementId: string, sourceFile: string): number {
  let count = 0;
  const headers = Object.keys(rows[0] || {}).map(h => h.toLowerCase());

  const dateCol = headers.find(h => h.includes('date'));
  const descCol = headers.find(h => h.includes('desc') || h.includes('memo'));
  const debitCol = headers.find(h => h.includes('debit'));
  const creditCol = headers.find(h => h.includes('credit'));
  const acctCol = headers.find(h => h.includes('account'));
  const entryCol = headers.find(h => h.includes('entry') || h.includes('journal') || h.includes('ref'));
  const userCol = headers.find(h => h.includes('user') || h.includes('posted') || h.includes('created'));

  let currentEntry: string | null = null;
  let jeId: string | null = null;

  for (const row of rows) {
    const keys = Object.keys(row);
    const entryNum = row[keys.find(k => k.toLowerCase() === entryCol) || ''] || `AUTO-${count}`;
    const date = row[keys.find(k => k.toLowerCase() === dateCol) || ''] || '';
    const desc = row[keys.find(k => k.toLowerCase() === descCol) || ''] || '';
    const debit = parseFloat(row[keys.find(k => k.toLowerCase() === debitCol) || ''] || '0') || 0;
    const credit = parseFloat(row[keys.find(k => k.toLowerCase() === creditCol) || ''] || '0') || 0;
    const acctName = row[keys.find(k => k.toLowerCase() === acctCol) || ''] || '';
    const user = row[keys.find(k => k.toLowerCase() === userCol) || ''] || 'unknown';

    if (entryNum !== currentEntry) {
      currentEntry = entryNum;
      jeId = uuid();
      db.insert(schema.journalEntries).values({
        id: jeId,
        engagementId,
        entryNumber: entryNum,
        date: date || new Date().toISOString().slice(0, 10),
        description: desc,
        postedBy: user,
        approvedBy: null,
        source: 'upload',
      }).run();
      count++;
    }

    if (jeId && (debit > 0 || credit > 0)) {
      db.insert(schema.journalEntryLines).values({
        id: uuid(),
        journalEntryId: jeId,
        accountId: 'uploaded',
        accountName: acctName,
        debit,
        credit,
        description: desc,
      }).run();
    }
  }

  return count;
}

function processTaxData(rows: Record<string, string>[], engagementId: string): number {
  let count = 0;
  const headers = Object.keys(rows[0] || {}).map(h => h.toLowerCase());

  const formCol = headers.find(h => h.includes('form'));
  const schedCol = headers.find(h => h.includes('sched'));
  const lineCol = headers.find(h => h.includes('line'));
  const descCol = headers.find(h => h.includes('desc'));
  const amountCol = headers.find(h => h.includes('amount') || h.includes('value'));

  for (const row of rows) {
    const keys = Object.keys(row);
    const form = row[keys.find(k => k.toLowerCase() === formCol) || ''] || '';
    const schedule = row[keys.find(k => k.toLowerCase() === schedCol) || ''] || 'main';
    const line = row[keys.find(k => k.toLowerCase() === lineCol) || ''] || '';
    const desc = row[keys.find(k => k.toLowerCase() === descCol) || ''] || '';
    const amount = parseFloat(row[keys.find(k => k.toLowerCase() === amountCol) || ''] || '0') || 0;

    if (!form && !desc) continue;

    db.insert(schema.taxData).values({
      id: uuid(),
      engagementId,
      formType: form,
      schedule,
      lineNumber: line,
      description: desc,
      amount,
      period: new Date().toISOString().slice(0, 7),
    }).run();

    count++;
  }

  return count;
}
