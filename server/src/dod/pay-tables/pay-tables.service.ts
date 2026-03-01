import { Injectable } from '@nestjs/common';
import {
  LookupMilitaryPayDto,
  LookupCivilianPayDto,
  CalculateMilitaryCompensationDto,
  CalculateCivilianCompensationDto,
} from './pay-tables.dto';

/**
 * Pay Tables Service
 *
 * Wraps the military and civilian pay calculation engines
 * from src/lib/engine/dod-pay/ for API access.
 */
@Injectable()
export class PayTablesService {
  async lookupMilitaryPay(dto: LookupMilitaryPayDto) {
    try {
      const { lookupBasePay, calculateBAS } = await import(
        '@shared/lib/engine/dod-pay/military-pay-tables'
      );
      const basePay = lookupBasePay(dto.grade, dto.yearsOfService, dto.fiscalYear);
      const bas = calculateBAS(dto.grade.startsWith('O'), dto.fiscalYear);

      return {
        grade: dto.grade,
        yearsOfService: dto.yearsOfService,
        fiscalYear: dto.fiscalYear,
        monthlyBasePay: basePay,
        annualBasePay: Math.round(basePay * 12 * 100) / 100,
        monthlyBAS: bas,
      };
    } catch {
      return {
        grade: dto.grade,
        yearsOfService: dto.yearsOfService,
        fiscalYear: dto.fiscalYear,
        monthlyBasePay: 0,
        annualBasePay: 0,
        monthlyBAS: 0,
        error: 'Pay table engine not available',
      };
    }
  }

  async lookupCivilianPay(dto: LookupCivilianPayDto) {
    try {
      const { lookupGSBasePay, calculateLocalityPay, calculateAdjustedPay } = await import(
        '@shared/lib/engine/dod-pay/civilian-pay-tables'
      );
      const basePay = lookupGSBasePay(dto.grade, dto.step, dto.fiscalYear);
      const adjustedPay = calculateAdjustedPay(dto.grade, dto.step, dto.localityArea, dto.fiscalYear);

      return {
        grade: dto.grade,
        step: dto.step,
        localityArea: dto.localityArea,
        fiscalYear: dto.fiscalYear,
        annualBasePay: basePay,
        annualAdjustedPay: adjustedPay,
        biweeklyPay: Math.round((adjustedPay / 26) * 100) / 100,
      };
    } catch {
      return {
        grade: dto.grade,
        step: dto.step,
        localityArea: dto.localityArea,
        fiscalYear: dto.fiscalYear,
        annualBasePay: 0,
        annualAdjustedPay: 0,
        biweeklyPay: 0,
        error: 'Pay table engine not available',
      };
    }
  }

  async calculateMilitaryCompensation(dto: CalculateMilitaryCompensationDto) {
    try {
      const engine = await import('@shared/lib/engine/dod-pay/military-pay-tables');
      const basePay = engine.lookupBasePay(dto.grade, dto.yearsOfService, dto.fiscalYear);
      const bas = engine.calculateBAS(dto.grade.startsWith('O'), dto.fiscalYear);

      return {
        grade: dto.grade,
        yearsOfService: dto.yearsOfService,
        fiscalYear: dto.fiscalYear,
        monthlyBasePay: basePay,
        monthlyBAS: bas,
        annualBasePay: Math.round(basePay * 12 * 100) / 100,
        annualBAS: Math.round(bas * 12 * 100) / 100,
      };
    } catch {
      return {
        grade: dto.grade,
        fiscalYear: dto.fiscalYear,
        error: 'Military pay engine not available',
      };
    }
  }

  async calculateCivilianCompensation(dto: CalculateCivilianCompensationDto) {
    try {
      const engine = await import('@shared/lib/engine/dod-pay/civilian-pay-tables');
      const adjustedPay = engine.calculateAdjustedPay(
        dto.grade,
        dto.step,
        dto.localityArea,
        dto.fiscalYear,
      );

      let fersContribution = 0;
      if (dto.fersEntryDate) {
        fersContribution = engine.calculateFERSContribution(adjustedPay, dto.fersEntryDate);
      }

      return {
        grade: dto.grade,
        step: dto.step,
        localityArea: dto.localityArea,
        fiscalYear: dto.fiscalYear,
        annualAdjustedPay: adjustedPay,
        biweeklyPay: Math.round((adjustedPay / 26) * 100) / 100,
        annualFERSContribution: fersContribution,
      };
    } catch {
      return {
        grade: dto.grade,
        step: dto.step,
        fiscalYear: dto.fiscalYear,
        error: 'Civilian pay engine not available',
      };
    }
  }
}
