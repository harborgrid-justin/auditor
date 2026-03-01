import { IsString, IsNumber, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCivilianPayDto {
  @ApiProperty({ description: 'Engagement ID this record belongs to' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Employee ID' })
  @IsString()
  employeeId: string;

  @ApiProperty({ description: 'Pay plan (e.g., GS, SES, WG)', example: 'GS' })
  @IsString()
  payPlan: string;

  @ApiProperty({ description: 'Grade level', example: '13' })
  @IsString()
  grade: string;

  @ApiProperty({ description: 'Step within grade', example: '5' })
  @IsString()
  step: string;

  @ApiProperty({ description: 'Locality pay area', example: 'Washington-Baltimore-Arlington' })
  @IsString()
  locality: string;

  @ApiProperty({ description: 'Basic pay amount' })
  @IsNumber()
  basicPay: number;

  @ApiPropertyOptional({ description: 'Locality pay adjustment', default: 0 })
  @IsOptional()
  @IsNumber()
  localityAdjustment?: number;

  @ApiPropertyOptional({ description: 'FEHB employer contribution', default: 0 })
  @IsOptional()
  @IsNumber()
  fehbContribution?: number;

  @ApiPropertyOptional({ description: 'FEGLI employer contribution', default: 0 })
  @IsOptional()
  @IsNumber()
  fegliContribution?: number;

  @ApiPropertyOptional({ description: 'Retirement plan contribution', default: 0 })
  @IsOptional()
  @IsNumber()
  retirementContribution?: number;

  @ApiProperty({ description: 'Retirement plan (e.g., FERS, CSRS, FERS-FRAE)' })
  @IsString()
  retirementPlan: string;

  @ApiPropertyOptional({ description: 'TSP contribution amount', default: 0 })
  @IsOptional()
  @IsNumber()
  tspContribution?: number;

  @ApiPropertyOptional({ description: 'TSP match amount', default: 0 })
  @IsOptional()
  @IsNumber()
  tspMatchAmount?: number;

  @ApiPropertyOptional({ description: 'Premium pay amount', default: 0 })
  @IsOptional()
  @IsNumber()
  premiumPay?: number;

  @ApiPropertyOptional({ description: 'Overtime pay amount', default: 0 })
  @IsOptional()
  @IsNumber()
  overtimePay?: number;

  @ApiPropertyOptional({ description: 'Leave hours accrued', default: 0 })
  @IsOptional()
  @IsNumber()
  leaveHoursAccrued?: number;

  @ApiPropertyOptional({ description: 'Override total compensation (auto-calculated if omitted)' })
  @IsOptional()
  @IsNumber()
  totalCompensation?: number;

  @ApiPropertyOptional({ description: 'Fiscal year' })
  @IsOptional()
  @IsInt()
  fiscalYear?: number;

  @ApiProperty({ description: 'Pay period identifier (e.g., 2024-01)' })
  @IsString()
  payPeriod: string;

  @ApiPropertyOptional({ description: 'Status', default: 'active' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateCivilianPayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  basicPay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  localityAdjustment?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  fehbContribution?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  retirementContribution?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  tspContribution?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  tspMatchAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  premiumPay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  overtimePay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  totalCompensation?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}
