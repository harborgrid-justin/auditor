import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';

export const budgetFormulationRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V02-001',
    name: 'Budget Submission Completeness',
    framework: 'DOD_FMR',
    category: 'Budget Formulation (Vol 2)',
    description: 'Verifies that all appropriations have a valid Treasury Account Symbol assigned for budget submission',
    citation: 'DoD FMR Vol 2, Ch 1; 31 U.S.C. § 1301 - Application of Appropriations',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      const missingTas = appropriations.filter(a => !a.treasuryAccountSymbol || a.treasuryAccountSymbol.trim().length === 0);

      if (missingTas.length > 0) {
        const totalAuthority = missingTas.reduce((sum, a) => sum + a.totalAuthority, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V02-001',
          'DOD_FMR',
          'high',
          'Appropriations Missing Treasury Account Symbol',
          `${missingTas.length} appropriation(s) totaling $${(totalAuthority / 1000000).toFixed(1)}M are missing Treasury Account Symbols (TAS): ${missingTas.map(a => a.appropriationTitle || a.id).join(', ')}. The TAS is the fundamental identifier for each appropriation and is required for all budget submissions, GTAS reporting, and Treasury reconciliation. Budget submissions are incomplete without valid TAS assignments.`,
          'DoD FMR Volume 2, Chapter 1: Each appropriation must be established with a complete Treasury Account Symbol. 31 U.S.C. § 1301: Appropriations shall be applied only to the objects for which they were made. TFM Vol I, Part 2, Ch 1500.',
          'Assign valid Treasury Account Symbols to all appropriations by referencing the Federal Account Symbols and Titles (FAST) publication. Validate TAS components with the Bureau of the Fiscal Service. Ensure budget submissions include all required TAS information.',
          totalAuthority,
          missingTas.map(a => a.id)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V02-002',
    name: 'Appropriation Structure Validation',
    framework: 'DOD_FMR',
    category: 'Budget Formulation (Vol 2)',
    description: 'Verifies that all appropriations have a properly assigned budget category for classification',
    citation: 'DoD FMR Vol 2, Ch 1; OMB Circular A-11, Section 79 - Budget Authority',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      const missingCategory = appropriations.filter(a => !a.budgetCategory);

      if (missingCategory.length > 0) {
        const totalAuthority = missingCategory.reduce((sum, a) => sum + a.totalAuthority, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V02-002',
          'DOD_FMR',
          'high',
          'Appropriations Missing Budget Category Assignment',
          `${missingCategory.length} appropriation(s) totaling $${(totalAuthority / 1000000).toFixed(1)}M do not have a budget category assigned: ${missingCategory.map(a => `"${a.appropriationTitle}" (TAS: ${a.treasuryAccountSymbol})`).join(', ')}. Budget categories (MILPERS, O&M, Procurement, RDT&E, MILCON, etc.) are essential for proper classification of appropriations in budget documents and congressional justification materials.`,
          'DoD FMR Volume 2, Chapter 1; OMB Circular A-11, Section 79: Each appropriation must be classified by budget category to support the President Budget submission and congressional review.',
          'Assign the correct budget category to each appropriation based on the enacted appropriation act. Verify categories align with the DoD budget structure (Title/Appropriation Group). Update financial system records to reflect the correct budget category assignments.',
          totalAuthority,
          missingCategory.map(a => a.treasuryAccountSymbol || a.id)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V02-003',
    name: 'Budget Object Code Classification',
    framework: 'DOD_FMR',
    category: 'Budget Formulation (Vol 2)',
    description: 'Checks that obligations have valid budget object codes assigned for proper object class reporting',
    citation: 'DoD FMR Vol 2, Ch 1; OMB Circular A-11, Section 83 - Object Classification',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { obligations, budgetObjectCodes } = data.dodData;

      if (budgetObjectCodes.length === 0 && obligations.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V02-003',
          'DOD_FMR',
          'medium',
          'No Budget Object Codes Defined',
          `No budget object codes (BOCs) are defined for this engagement, yet ${obligations.length} obligation(s) exist. BOCs classify obligations and expenditures by the nature of goods and services purchased and are required for OMB object class reporting on the SF 132 and SF 133.`,
          'DoD FMR Volume 2, Chapter 1; OMB Circular A-11, Section 83: All obligations must be classified by object class using approved budget object codes.',
          'Establish a complete BOC structure aligned with OMB object classification requirements. Map all existing obligations to the appropriate BOC categories.',
          null,
          []
        ));
        return findings;
      }

      const validBocCodes = new Set(budgetObjectCodes.map(b => b.code));
      const invalidBocObligations = obligations.filter(o => !o.budgetObjectCode || !validBocCodes.has(o.budgetObjectCode));

      if (invalidBocObligations.length > 0) {
        const totalAmount = invalidBocObligations.reduce((sum, o) => sum + o.amount, 0);
        const invalidCodes = Array.from(new Set(invalidBocObligations.map(o => o.budgetObjectCode).filter(Boolean)));
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V02-003',
          'DOD_FMR',
          'medium',
          'Obligations with Invalid or Missing Budget Object Codes',
          `${invalidBocObligations.length} obligation(s) totaling $${(totalAmount / 1000000).toFixed(2)}M have invalid or missing budget object codes. ${invalidCodes.length > 0 ? `Invalid codes referenced: ${invalidCodes.join(', ')}.` : 'All are missing BOC assignments.'} Invalid BOC classifications lead to incorrect object class reporting and may cause SF 132/SF 133 errors.`,
          'DoD FMR Volume 2, Chapter 1; OMB Circular A-11, Section 83: Obligations must be classified using valid object class codes.',
          'Correct the BOC assignments on all affected obligations. Verify the BOC structure is up to date and includes all codes required for the current fiscal year. Implement system edits to reject transactions with invalid or missing BOC values.',
          totalAmount,
          invalidBocObligations.map(o => o.obligationNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V02-004',
    name: 'Program Element Traceability',
    framework: 'DOD_FMR',
    category: 'Budget Formulation (Vol 2)',
    description: 'Checks that obligations have program element codes where required for FYDP traceability',
    citation: 'DoD FMR Vol 2, Ch 1; DoDI 7045.7 - FYDP Structure',
    defaultSeverity: 'low',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { obligations } = data.dodData;

      if (obligations.length === 0) return findings;

      const missingPE = obligations.filter(o => !o.programElement);

      if (missingPE.length > 0) {
        const totalAmount = missingPE.reduce((sum, o) => sum + o.amount, 0);
        const pct = ((missingPE.length / obligations.length) * 100).toFixed(1);

        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V02-004',
          'DOD_FMR',
          'low',
          'Obligations Missing Program Element Codes',
          `${missingPE.length} of ${obligations.length} obligation(s) (${pct}%) are missing program element (PE) codes, totaling $${(totalAmount / 1000000).toFixed(2)}M. Program elements are the building blocks of the Future Years Defense Program (FYDP) and are essential for linking budget execution to program planning and resource allocation decisions.`,
          'DoD FMR Volume 2, Chapter 1; DoDI 7045.7: All resources must be mapped to program elements in the FYDP structure for proper program-budget alignment.',
          'Assign valid program element codes to all obligations. Coordinate with the component programming office to ensure PE codes align with the current FYDP structure. Implement system edits to require PE code assignment at obligation entry.',
          totalAmount,
          missingPE.slice(0, 20).map(o => o.obligationNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V02-005',
    name: 'Budget Activity Code Consistency',
    framework: 'DOD_FMR',
    category: 'Budget Formulation (Vol 2)',
    description: 'Verifies that budget activity codes are populated on obligations for proper budget classification',
    citation: 'DoD FMR Vol 2, Ch 1; OMB Circular A-11, Section 82 - Budget Activity',
    defaultSeverity: 'low',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { obligations } = data.dodData;

      if (obligations.length === 0) return findings;

      const missingActivityCode = obligations.filter(o => !o.budgetActivityCode);

      if (missingActivityCode.length > 0) {
        const totalAmount = missingActivityCode.reduce((sum, o) => sum + o.amount, 0);
        const pct = ((missingActivityCode.length / obligations.length) * 100).toFixed(1);

        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V02-005',
          'DOD_FMR',
          'low',
          'Obligations Missing Budget Activity Codes',
          `${missingActivityCode.length} of ${obligations.length} obligation(s) (${pct}%) are missing budget activity codes, totaling $${(totalAmount / 1000000).toFixed(2)}M. Budget activity codes are required to properly classify obligations within each appropriation for congressional budget justification documents, the President's Budget, and execution reporting.`,
          'DoD FMR Volume 2, Chapter 1; OMB Circular A-11, Section 82: Budget activities subdivide appropriation accounts for presentation in the budget and are required for proper classification.',
          'Assign appropriate budget activity codes to all obligations. Implement system controls to require budget activity code entry at the time of obligation recording. Reconcile budget activity totals to appropriation-level data.',
          totalAmount,
          missingActivityCode.slice(0, 20).map(o => o.obligationNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V02-006',
    name: 'Multi-Year Appropriation Tracking',
    framework: 'DOD_FMR',
    category: 'Budget Formulation (Vol 2)',
    description: 'Verifies that multi-year appropriations have proper fiscal year start and end dates for period of availability',
    citation: 'DoD FMR Vol 2, Ch 1; 31 U.S.C. § 1502 - Balances Available',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations, fiscalYear } = data.dodData;

      const multiYearApprops = appropriations.filter(a => a.appropriationType === 'multi_year');

      for (const approp of multiYearApprops) {
        const fyStart = new Date(approp.fiscalYearStart).getFullYear();
        const fyEnd = new Date(approp.fiscalYearEnd).getFullYear();

        if (!approp.fiscalYearStart || !approp.fiscalYearEnd) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V02-006',
            'DOD_FMR',
            'high',
            'Multi-Year Appropriation Missing Period of Availability',
            `Multi-year appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}) is missing fiscal year start and/or end dates. Multi-year appropriations must have a defined period of availability to properly track fund expiration and ensure compliance with the time restriction of appropriations law.`,
            'DoD FMR Volume 2, Chapter 1; 31 U.S.C. § 1502: The balance of an appropriation available for a definite period is available only during that period for incurring new obligations.',
            'Record the correct fiscal year start and end dates based on the enacted appropriation act. Verify the period of availability matches the statutory authority.',
            approp.totalAuthority,
            [approp.treasuryAccountSymbol || approp.id]
          ));
          continue;
        }

        if (fyEnd <= fyStart) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V02-006',
            'DOD_FMR',
            'medium',
            'Multi-Year Appropriation Invalid Period of Availability',
            `Multi-year appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}) has an ending fiscal year (${fyEnd}) that is not after the starting fiscal year (${fyStart}). Multi-year appropriations must span at least two fiscal years.`,
            'DoD FMR Volume 2, Chapter 1; 31 U.S.C. § 1502: Multi-year appropriations have a period of availability spanning more than one fiscal year.',
            'Correct the fiscal year dates to reflect the actual statutory period of availability. Verify against the enacted appropriation or authorization act.',
            null,
            [approp.treasuryAccountSymbol]
          ));
        }

        if (fyEnd - fyStart > 7) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V02-006',
            'DOD_FMR',
            'low',
            'Multi-Year Appropriation with Unusually Long Availability Period',
            `Multi-year appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}) spans ${fyEnd - fyStart} fiscal years (FY${fyStart}-FY${fyEnd}), which exceeds the typical maximum of 5-7 years. Verify this is consistent with the statutory appropriation authority.`,
            'DoD FMR Volume 2, Chapter 1; 31 U.S.C. § 1502: Multi-year appropriations typically have 2-5 year availability periods as established by law.',
            'Verify the period of availability against the enacted appropriation act. If the extended period is intentional (e.g., shipbuilding or MILCON), document the statutory authority. Otherwise, correct the fiscal year end date.',
            null,
            [approp.treasuryAccountSymbol]
          ));
        }
      }

      return findings;
    },
  },
];
