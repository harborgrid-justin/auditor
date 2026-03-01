/**
 * Management Representation Letter Generator (AU-C 580)
 *
 * Generates a formal management representation letter that must be obtained
 * from management as a precondition for issuing an audit opinion.
 */

export interface RepresentationLetterData {
  entityName: string;
  fiscalYearEnd: string;
  auditorFirmName: string;
  ceoName: string;
  cfoName: string;
  passedAdjustments: Array<{
    description: string;
    amount: number;
  }>;
  relatedParties: Array<{
    partyName: string;
    relationship: string;
  }>;
  subsequentEvents: Array<{
    description: string;
    eventType: string;
  }>;
  goingConcernIssues: boolean;
  litigationItems: Array<{
    description: string;
    estimatedAmount?: number;
  }>;
  generatedAt: string;
}

/**
 * Generate a management representation letter per AU-C 580.
 */
export function generateRepresentationLetter(data: RepresentationLetterData): string {
  const today = new Date(data.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let letter = `
${today}

${data.auditorFirmName}
[Address]

In connection with your audit of the financial statements of ${data.entityName} as of and for the year ended ${data.fiscalYearEnd}, for the purpose of expressing an opinion as to whether the financial statements present fairly, in all material respects, the financial position, results of operations, and cash flows of ${data.entityName} in conformity with accounting principles generally accepted in the United States of America (U.S. GAAP), we confirm, to the best of our knowledge and belief, the following representations:

FINANCIAL STATEMENTS
${'─'.repeat(50)}

1. We have fulfilled our responsibilities, as set out in the terms of the audit engagement, for the preparation and fair presentation of the financial statements referred to above in accordance with U.S. GAAP.

2. We acknowledge our responsibility for the design, implementation, and maintenance of internal control relevant to the preparation and fair presentation of financial statements that are free from material misstatement, whether due to fraud or error.

3. We acknowledge our responsibility for the design, implementation, and maintenance of internal control to prevent and detect fraud.

4. Significant assumptions used by us in making accounting estimates, including those measured at fair value, are reasonable.

5. Related party relationships and transactions have been appropriately accounted for and disclosed in accordance with ASC 850.

6. All events subsequent to the date of the financial statements and for which U.S. GAAP requires adjustment or disclosure have been adjusted or disclosed.

7. The effects of uncorrected misstatements are immaterial, both individually and in the aggregate, to the financial statements as a whole. A list of the uncorrected misstatements is attached to this letter.

8. The effects of all known actual or possible litigation and claims have been accounted for and disclosed in accordance with ASC 450.

INFORMATION PROVIDED
${'─'.repeat(50)}

9. We have provided you with:
   a. Access to all information of which we are aware that is relevant to the preparation and fair presentation of the financial statements, such as records, documentation, and other matters.
   b. Additional information that you have requested from us for the purpose of the audit.
   c. Unrestricted access to persons within the entity from whom you determined it necessary to obtain audit evidence.

10. All transactions have been recorded in the accounting records and are reflected in the financial statements.

11. We have disclosed to you the results of our assessment of the risk that the financial statements may be materially misstated as a result of fraud.

12. We have disclosed to you all information in regard to fraud or suspected fraud that we are aware of involving:
    a. Management
    b. Employees who have significant roles in internal control
    c. Others where the fraud could have a material effect on the financial statements

13. We have disclosed to you all known instances of non-compliance or suspected non-compliance with laws and regulations whose effects should be considered when preparing financial statements.

14. We have disclosed to you all known actual or possible litigation and claims whose effects should be considered when preparing the financial statements.

15. We have disclosed to you the identity of the entity's related parties and all the related party relationships and transactions of which we are aware.
`;

  // Related parties section
  if (data.relatedParties.length > 0) {
    letter += `
RELATED PARTIES
${'─'.repeat(50)}

The following related parties and relationships have been identified and disclosed:

`;
    data.relatedParties.forEach((rp, i) => {
      letter += `${i + 1}. ${rp.partyName} — ${rp.relationship}\n`;
    });
  }

  // Subsequent events
  if (data.subsequentEvents.length > 0) {
    letter += `
SUBSEQUENT EVENTS
${'─'.repeat(50)}

The following subsequent events have been identified:

`;
    data.subsequentEvents.forEach((se, i) => {
      letter += `${i + 1}. ${se.description} (${se.eventType === 'type_1_adjusting' ? 'Type I — Adjusting' : 'Type II — Non-adjusting'})\n`;
    });
  }

  // Going concern
  if (data.goingConcernIssues) {
    letter += `
GOING CONCERN
${'─'.repeat(50)}

We have disclosed to you all conditions and events that, in our judgment, raise substantial doubt about the entity's ability to continue as a going concern. We have also disclosed our plans regarding these conditions and events and the feasibility and expected effectiveness of those plans.
`;
  }

  // Litigation
  if (data.litigationItems.length > 0) {
    letter += `
LITIGATION, CLAIMS, AND ASSESSMENTS
${'─'.repeat(50)}

The following matters involving litigation, claims, or assessments have been disclosed:

`;
    data.litigationItems.forEach((item, i) => {
      letter += `${i + 1}. ${item.description}${item.estimatedAmount ? ` (Estimated: $${Math.round(item.estimatedAmount).toLocaleString()})` : ''}\n`;
    });
  }

  // Passed adjustments (SUD)
  if (data.passedAdjustments.length > 0) {
    letter += `
UNCORRECTED MISSTATEMENTS (ATTACHED SCHEDULE)
${'─'.repeat(50)}

We have reviewed the attached summary of uncorrected misstatements and have determined that their effects are immaterial, both individually and in the aggregate, to the financial statements as a whole:

`;
    let totalPassed = 0;
    data.passedAdjustments.forEach((adj, i) => {
      letter += `${i + 1}. ${adj.description} — $${Math.round(adj.amount).toLocaleString()}\n`;
      totalPassed += adj.amount;
    });
    letter += `\nTotal uncorrected misstatements: $${Math.round(totalPassed).toLocaleString()}\n`;
  } else {
    letter += `
No uncorrected misstatements were identified during the audit.\n`;
  }

  // Signature block
  letter += `
${'─'.repeat(50)}

Yours truly,

_________________________
${data.ceoName}
Chief Executive Officer
${data.entityName}

_________________________
${data.cfoName}
Chief Financial Officer
${data.entityName}

Date: ${today}
`;

  return letter.trim();
}
