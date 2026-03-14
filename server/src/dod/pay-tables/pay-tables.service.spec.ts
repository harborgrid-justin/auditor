import { Test, TestingModule } from '@nestjs/testing';
import { PayTablesService } from './pay-tables.service';

jest.mock('@shared/lib/engine/dod-pay/military-pay-tables', () => ({
  lookupBasePay: jest.fn().mockReturnValue(5000),
  calculateBAS: jest.fn().mockReturnValue(400),
}), { virtual: true });

jest.mock('@shared/lib/engine/dod-pay/civilian-pay-tables', () => ({
  lookupGSBasePay: jest.fn().mockReturnValue(75000),
  calculateLocalityPay: jest.fn().mockReturnValue(15000),
  calculateAdjustedPay: jest.fn().mockReturnValue(90000),
  calculateFERSContribution: jest.fn().mockReturnValue(3600),
}), { virtual: true });

describe('PayTablesService', () => {
  let service: PayTablesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayTablesService],
    }).compile();

    service = module.get<PayTablesService>(PayTablesService);
  });

  describe('lookupMilitaryPay', () => {
    it('should return military pay data', async () => {
      const result = await service.lookupMilitaryPay({
        grade: 'O-3',
        yearsOfService: 6,
        fiscalYear: 2025,
      } as any);

      expect(result.grade).toBe('O-3');
      expect(result.monthlyBasePay).toBe(5000);
      expect(result.annualBasePay).toBe(60000);
      expect(result.monthlyBAS).toBe(400);
    });
  });

  describe('lookupCivilianPay', () => {
    it('should return civilian pay data', async () => {
      const result = await service.lookupCivilianPay({
        grade: 13,
        step: 5,
        localityArea: 'DC',
        fiscalYear: 2025,
      } as any);

      expect(result.grade).toBe(13);
      expect(result.annualBasePay).toBe(75000);
      expect(result.annualAdjustedPay).toBe(90000);
      expect(result.biweeklyPay).toBe(Math.round((90000 / 26) * 100) / 100);
    });
  });

  describe('calculateMilitaryCompensation', () => {
    it('should calculate military compensation', async () => {
      const result = await service.calculateMilitaryCompensation({
        grade: 'O-4',
        yearsOfService: 10,
        fiscalYear: 2025,
      } as any);

      expect(result.monthlyBasePay).toBe(5000);
      expect(result.monthlyBAS).toBe(400);
      expect(result.annualBasePay).toBe(60000);
      expect(result.annualBAS).toBe(4800);
    });
  });

  describe('calculateCivilianCompensation', () => {
    it('should calculate civilian compensation', async () => {
      const result = await service.calculateCivilianCompensation({
        grade: 14,
        step: 7,
        localityArea: 'DC',
        fiscalYear: 2025,
        fersEntryDate: '2015-01-01',
      } as any);

      expect(result.annualAdjustedPay).toBe(90000);
      expect(result.biweeklyPay).toBe(Math.round((90000 / 26) * 100) / 100);
      expect(result.annualFERSContribution).toBe(3600);
    });

    it('should handle missing fersEntryDate', async () => {
      const result = await service.calculateCivilianCompensation({
        grade: 14,
        step: 7,
        localityArea: 'DC',
        fiscalYear: 2025,
      } as any);

      expect(result.annualFERSContribution).toBe(0);
    });
  });
});
