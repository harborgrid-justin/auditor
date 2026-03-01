import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDebtRecordDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Debtor name' })
  @IsString()
  debtorName: string;

  @ApiProperty({ description: 'Original debt amount' })
  @IsNumber()
  originalAmount: number;

  @ApiProperty({ description: 'Current balance' })
  @IsNumber()
  currentBalance: number;

  @ApiProperty({ enum: ['overpayment', 'erroneous_payment', 'advance', 'fine', 'penalty', 'fee', 'other'] })
  @IsEnum(['overpayment', 'erroneous_payment', 'advance', 'fine', 'penalty', 'fee', 'other'])
  debtType: string;

  @ApiProperty({ description: 'Delinquency date (ISO 8601)' })
  @IsString()
  delinquencyDate: string;

  @ApiPropertyOptional({ description: 'Fiscal year' })
  @IsOptional()
  @IsNumber()
  fiscalYear?: number;
}

export class GenerateDemandLetterDto {
  @ApiProperty({ description: 'Debt record ID' })
  @IsString()
  debtId: string;

  @ApiProperty({ enum: ['initial', '30_day', '60_day', '90_day'] })
  @IsEnum(['initial', '30_day', '60_day', '90_day'])
  letterType: string;
}

export class EvaluateCompromiseDto {
  @ApiProperty({ description: 'Debt record ID' })
  @IsString()
  debtId: string;

  @ApiProperty({ description: 'Offered compromise amount' })
  @IsNumber()
  offeredAmount: number;

  @ApiPropertyOptional({ description: 'Justification for compromise' })
  @IsOptional()
  @IsString()
  justification?: string;
}

export class InitiateSalaryOffsetDto {
  @ApiProperty({ description: 'Debt record ID' })
  @IsString()
  debtId: string;

  @ApiProperty({ description: 'Employee ID' })
  @IsString()
  employeeId: string;

  @ApiProperty({ description: 'Employee disposable pay per period' })
  @IsNumber()
  disposablePay: number;
}
