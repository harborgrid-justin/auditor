import { IsString, IsNumber, IsOptional, IsEnum, IsArray, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBudgetFormulationDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Budget fiscal year' })
  @IsNumber()
  fiscalYear: number;

  @ApiProperty({ enum: ['planning', 'programming', 'budgeting', 'execution'] })
  @IsEnum(['planning', 'programming', 'budgeting', 'execution'])
  ppbePhase: string;

  @ApiProperty({ description: 'Program element code' })
  @IsString()
  programElement: string;

  @ApiProperty({ description: 'Budget activity code' })
  @IsString()
  budgetActivity: string;

  @ApiProperty({ description: 'Budget sub-activity code' })
  @IsString()
  budgetSubActivity: string;

  @ApiProperty({ description: 'Requested amount' })
  @IsNumber()
  requestedAmount: number;

  @ApiPropertyOptional({ description: 'Justification narrative' })
  @IsOptional()
  @IsString()
  justification?: string;

  @ApiPropertyOptional({ description: 'FYDP profile as JSON' })
  @IsOptional()
  @IsObject()
  fydpProfile?: Record<string, number>;
}

export class SubmitUnfundedRequirementDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;

  @ApiProperty({ description: 'Requirement title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Requirement description' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Requested amount' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Priority ranking' })
  @IsNumber()
  priority: number;

  @ApiPropertyOptional({ description: 'Mission impact assessment' })
  @IsOptional()
  @IsString()
  missionImpact?: string;
}
