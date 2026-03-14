import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInteragencyAgreementDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Agreement number' })
  @IsString()
  agreementNumber: string;

  @ApiProperty({ enum: ['economy_act', 'mipra', 'non_economy_act', 'assisted_acquisition'] })
  @IsEnum(['economy_act', 'mipra', 'non_economy_act', 'assisted_acquisition'])
  agreementType: string;

  @ApiProperty({ description: 'Requesting agency' })
  @IsString()
  requestingAgency: string;

  @ApiProperty({ description: 'Servicing agency' })
  @IsString()
  servicingAgency: string;

  @ApiProperty({ description: 'Authority' })
  @IsString()
  authority: string;

  @ApiProperty({ description: 'Agreement amount' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Obligated amount' })
  @IsNumber()
  obligatedAmount: number;

  @ApiProperty({ description: 'Billed amount' })
  @IsNumber()
  billedAmount: number;

  @ApiProperty({ description: 'Collected amount' })
  @IsNumber()
  collectedAmount: number;

  @ApiProperty({ description: 'Advance received' })
  @IsNumber()
  advanceReceived: number;

  @ApiProperty({ enum: ['draft', 'active', 'completed', 'closed'] })
  @IsEnum(['draft', 'active', 'completed', 'closed'])
  status: string;

  @ApiProperty({ description: 'Period of performance' })
  @IsString()
  periodOfPerformance: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateIAAStatusDto {
  @ApiProperty({ description: 'Interagency agreement ID' })
  @IsString()
  id: string;

  @ApiProperty({ enum: ['draft', 'active', 'completed', 'closed'] })
  @IsEnum(['draft', 'active', 'completed', 'closed'])
  status: string;

  @ApiPropertyOptional({ description: 'Comment' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateWorkingCapitalFundDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Fund name' })
  @IsString()
  fundName: string;

  @ApiProperty({ enum: ['supply', 'maintenance', 'research', 'commissary', 'other'] })
  @IsEnum(['supply', 'maintenance', 'research', 'commissary', 'other'])
  fundType: string;

  @ApiProperty({ description: 'Revenue from operations' })
  @IsNumber()
  revenueFromOperations: number;

  @ApiProperty({ description: 'Cost of operations' })
  @IsNumber()
  costOfOperations: number;

  @ApiProperty({ description: 'Net operating result' })
  @IsNumber()
  netOperatingResult: number;

  @ApiProperty({ description: 'Cash balance' })
  @IsNumber()
  cashBalance: number;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;
}

export class RunIAAAnalysisDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;
}
