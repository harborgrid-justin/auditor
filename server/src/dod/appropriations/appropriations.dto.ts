import { IsString, IsNumber, IsOptional, IsEnum, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppropriationDto {
  @ApiProperty({ description: 'Engagement ID this appropriation belongs to' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Treasury Account Symbol (e.g., 097-0100)', example: '021-1804' })
  @IsString()
  treasuryAccountSymbol: string;

  @ApiProperty({ enum: ['one_year', 'multi_year', 'no_year', 'revolving', 'trust', 'special', 'naf'] })
  @IsEnum(['one_year', 'multi_year', 'no_year', 'revolving', 'trust', 'special', 'naf'])
  appropriationType: string;

  @ApiProperty({ description: 'Title of the appropriation' })
  @IsString()
  appropriationTitle: string;

  @ApiProperty({ enum: ['milpers', 'om', 'procurement', 'rdte', 'milcon', 'family_housing', 'brac', 'working_capital', 'naf', 'other'] })
  @IsEnum(['milpers', 'om', 'procurement', 'rdte', 'milcon', 'family_housing', 'brac', 'working_capital', 'naf', 'other'])
  budgetCategory: string;

  @ApiProperty({ description: 'Fiscal year start (YYYY-MM-DD)' })
  @IsString()
  fiscalYearStart: string;

  @ApiProperty({ description: 'Fiscal year end (YYYY-MM-DD)' })
  @IsString()
  fiscalYearEnd: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expirationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cancellationDate?: string;

  @ApiProperty({ description: 'Total budget authority', default: 0 })
  @IsNumber()
  totalAuthority: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  apportioned?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  allotted?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  committed?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  obligated?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  disbursed?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  unobligatedBalance?: number;

  @ApiPropertyOptional({ enum: ['current', 'expired', 'cancelled'], default: 'current' })
  @IsOptional()
  @IsEnum(['current', 'expired', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({ description: 'SFIS mapping data as JSON' })
  @IsOptional()
  @IsObject()
  sfisData?: Record<string, string>;
}

export class UpdateAppropriationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  totalAuthority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  apportioned?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  allotted?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  committed?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  obligated?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  disbursed?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  unobligatedBalance?: number;

  @ApiPropertyOptional({ enum: ['current', 'expired', 'cancelled'] })
  @IsOptional()
  @IsEnum(['current', 'expired', 'cancelled'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  sfisData?: Record<string, string>;
}
