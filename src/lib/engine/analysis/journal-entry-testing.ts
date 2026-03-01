import type { JournalEntry } from '@/types/financial';

export interface JETestResult {
  testName: string;
  description: string;
  flaggedEntries: FlaggedJournalEntry[];
  totalTested: number;
  riskLevel: 'high' | 'medium' | 'low';
}

export interface FlaggedJournalEntry {
  entryNumber: string;
  date: string;
  description: string;
  amount: number;
  postedBy: string;
  reason: string;
}

export function runJournalEntryTests(
  entries: JournalEntry[],
  fiscalYearEnd: string,
  materialityThreshold: number
): JETestResult[] {
  const results: JETestResult[] = [];

  // Test 1: Weekend/Holiday entries
  const weekendEntries = entries.filter(je => {
    const d = new Date(je.date);
    const day = d.getDay();
    return day === 0 || day === 6;
  });
  results.push({
    testName: 'Weekend Journal Entries',
    description: 'Entries posted on Saturday or Sunday may indicate unauthorized activity',
    flaggedEntries: weekendEntries.map(je => ({
      entryNumber: je.entryNumber,
      date: je.date,
      description: je.description,
      amount: je.lines.reduce((sum, l) => sum + l.debit, 0),
      postedBy: je.postedBy,
      reason: `Posted on ${new Date(je.date).toLocaleDateString('en-US', { weekday: 'long' })}`,
    })),
    totalTested: entries.length,
    riskLevel: weekendEntries.length > 2 ? 'high' : weekendEntries.length > 0 ? 'medium' : 'low',
  });

  // Test 2: Round-number entries (multiples of $100,000)
  const roundEntries = entries.filter(je =>
    je.lines.some(l => {
      const amount = Math.max(l.debit, l.credit);
      return amount >= 100000 && amount % 100000 === 0;
    })
  );
  results.push({
    testName: 'Round-Number Entries',
    description: 'Entries with amounts that are exact multiples of $100,000 may indicate estimates or fabrication',
    flaggedEntries: roundEntries.map(je => ({
      entryNumber: je.entryNumber,
      date: je.date,
      description: je.description,
      amount: Math.max(...je.lines.map(l => Math.max(l.debit, l.credit))),
      postedBy: je.postedBy,
      reason: 'Round-number amount (multiple of $100K)',
    })),
    totalTested: entries.length,
    riskLevel: roundEntries.length > 3 ? 'high' : roundEntries.length > 0 ? 'medium' : 'low',
  });

  // Test 3: Entries without approval
  const unapproved = entries.filter(je => !je.approvedBy);
  results.push({
    testName: 'Unapproved Entries',
    description: 'Entries posted without documented approval violate segregation of duties',
    flaggedEntries: unapproved.map(je => ({
      entryNumber: je.entryNumber,
      date: je.date,
      description: je.description,
      amount: je.lines.reduce((sum, l) => sum + l.debit, 0),
      postedBy: je.postedBy,
      reason: 'No approver documented',
    })),
    totalTested: entries.length,
    riskLevel: unapproved.length > entries.length * 0.2 ? 'high' : unapproved.length > 0 ? 'medium' : 'low',
  });

  // Test 4: Post-close entries
  const fyeDate = new Date(fiscalYearEnd);
  const postClose = entries.filter(je => new Date(je.date) > fyeDate);
  results.push({
    testName: 'Post-Close Entries',
    description: 'Entries dated after fiscal year-end require heightened scrutiny',
    flaggedEntries: postClose.map(je => ({
      entryNumber: je.entryNumber,
      date: je.date,
      description: je.description,
      amount: je.lines.reduce((sum, l) => sum + l.debit, 0),
      postedBy: je.postedBy,
      reason: `Posted ${Math.ceil((new Date(je.date).getTime() - fyeDate.getTime()) / (1000 * 60 * 60 * 24))} days after FYE`,
    })),
    totalTested: entries.length,
    riskLevel: postClose.length > 2 ? 'high' : postClose.length > 0 ? 'medium' : 'low',
  });

  // Test 5: Same preparer and approver
  const samePrepAppr = entries.filter(je =>
    je.postedBy && je.approvedBy &&
    je.postedBy.toLowerCase() === je.approvedBy.toLowerCase()
  );
  results.push({
    testName: 'Same Preparer & Approver',
    description: 'Entries prepared and approved by the same person violate SOD',
    flaggedEntries: samePrepAppr.map(je => ({
      entryNumber: je.entryNumber,
      date: je.date,
      description: je.description,
      amount: je.lines.reduce((sum, l) => sum + l.debit, 0),
      postedBy: je.postedBy,
      reason: `Both prepared and approved by ${je.postedBy}`,
    })),
    totalTested: entries.length,
    riskLevel: samePrepAppr.length > 0 ? 'high' : 'low',
  });

  // Test 6: Entries just below materiality threshold
  if (materialityThreshold > 0) {
    const justBelow = entries.filter(je => {
      const maxAmount = Math.max(...je.lines.map(l => Math.max(l.debit, l.credit)));
      return maxAmount >= materialityThreshold * 0.8 && maxAmount < materialityThreshold;
    });
    results.push({
      testName: 'Entries Just Below Materiality',
      description: 'Entries with amounts clustered just below the materiality threshold may indicate structuring',
      flaggedEntries: justBelow.map(je => ({
        entryNumber: je.entryNumber,
        date: je.date,
        description: je.description,
        amount: Math.max(...je.lines.map(l => Math.max(l.debit, l.credit))),
        postedBy: je.postedBy,
        reason: `Amount is ${(Math.max(...je.lines.map(l => Math.max(l.debit, l.credit))) / materialityThreshold * 100).toFixed(0)}% of materiality`,
      })),
      totalTested: entries.length,
      riskLevel: justBelow.length > 3 ? 'high' : justBelow.length > 0 ? 'medium' : 'low',
    });
  }

  // Test 7: Unusual users
  const userCounts: Record<string, number> = {};
  entries.forEach(je => { userCounts[je.postedBy] = (userCounts[je.postedBy] || 0) + 1; });
  const avgEntries = entries.length / Object.keys(userCounts).length;
  const infrequentUsers = Object.entries(userCounts)
    .filter(([, count]) => count <= 1)
    .map(([user]) => user);

  const infrequentEntries = entries.filter(je => infrequentUsers.includes(je.postedBy));
  if (infrequentEntries.length > 0) {
    results.push({
      testName: 'Infrequent Users',
      description: 'Entries by users who rarely post journal entries may warrant additional review',
      flaggedEntries: infrequentEntries.map(je => ({
        entryNumber: je.entryNumber,
        date: je.date,
        description: je.description,
        amount: je.lines.reduce((sum, l) => sum + l.debit, 0),
        postedBy: je.postedBy,
        reason: `User "${je.postedBy}" posted only ${userCounts[je.postedBy]} entries (avg: ${avgEntries.toFixed(1)})`,
      })),
      totalTested: entries.length,
      riskLevel: 'medium',
    });
  }

  return results;
}
