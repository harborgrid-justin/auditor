import { IsString, IsNumber, IsOptional, IsBoolean, IsInt, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMilitaryPayDto {
  @ApiProperty({ description: 'Engagement ID this record belongs to' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Service member ID' })
  @IsString()
  memberId: string;

  @ApiProperty({ description: 'Pay grade (e.g., E-5, O-3)', example: 'E-5' })
  @IsString()
  payGrade: string;

  @ApiProperty({ description: 'Years of service' })
  @IsInt()
  yearsOfService: number;

  @ApiProperty({ description: 'Basic pay amount' })
  @IsNumber()
  basicPay: number;

  @ApiPropertyOptional({ description: 'Basic Allowance for Housing', default: 0 })
  @IsOptional()
  @IsNumber()
  bah?: number;

  @ApiPropertyOptional({ description: 'Basic Allowance for Subsistence', default: 0 })
  @IsOptional()
  @IsNumber()
  bas?: number;

  @ApiPropertyOptional({ description: 'Special pays as JSON object' })
  @IsOptional()
  @IsObject()
  specialPaysJson?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Incentive pays as JSON object' })
  @IsOptional()
  @IsObject()
  incentivePaysJson?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Combat zone tax exclusion applies', default: false })
  @IsOptional()
  @IsBoolean()
  combatZoneExclusion?: boolean;

  @ApiPropertyOptional({ description: 'TSP contribution amount', default: 0 })
  @IsOptional()
  @IsNumber()
  tspContribution?: number;

  @ApiPropertyOptional({ description: 'TSP match amount', default: 0 })
  @IsOptional()
  @IsNumber()
  tspMatchAmount?: number;

  @ApiPropertyOptional({ description: 'Separation pay amount', default: 0 })
  @IsOptional()
  @IsNumber()
  separationPay?: number;

  @ApiPropertyOptional({ description: 'Retirement pay amount', default: 0 })
  @IsOptional()
  @IsNumber()
  retirementPay?: number;

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

export class UpdateMilitaryPayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  basicPay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  bah?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  bas?: number;

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
  totalCompensation?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}
