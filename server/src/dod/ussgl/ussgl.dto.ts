import { IsString, IsNumber, IsOptional, IsInt, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUssglAccountDto {
  @ApiProperty({ description: 'Engagement ID this account belongs to' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'USSGL account number (e.g., 4100, 4200)', example: '4100' })
  @IsString()
  accountNumber: string;

  @ApiProperty({ description: 'Account title' })
  @IsString()
  accountTitle: string;

  @ApiProperty({ description: 'Account type', enum: ['proprietary', 'budgetary'] })
  @IsEnum(['proprietary', 'budgetary'])
  accountType: string;

  @ApiProperty({ description: 'Normal balance side', enum: ['debit', 'credit'] })
  @IsEnum(['debit', 'credit'])
  normalBalance: string;

  @ApiPropertyOptional({ description: 'Beginning balance', default: 0 })
  @IsOptional()
  @IsNumber()
  beginBalance?: number;

  @ApiPropertyOptional({ description: 'Total debits for the period', default: 0 })
  @IsOptional()
  @IsNumber()
  totalDebits?: number;

  @ApiPropertyOptional({ description: 'Total credits for the period', default: 0 })
  @IsOptional()
  @IsNumber()
  totalCredits?: number;

  @ApiPropertyOptional({ description: 'Ending balance', default: 0 })
  @IsOptional()
  @IsNumber()
  endBalance?: number;

  @ApiPropertyOptional({ description: 'Fiscal year' })
  @IsOptional()
  @IsInt()
  fiscalYear?: number;
}

export class UpdateUssglAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  beginBalance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  totalDebits?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  totalCredits?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  endBalance?: number;
}
