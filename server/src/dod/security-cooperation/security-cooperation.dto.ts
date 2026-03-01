import { IsString, IsNumber, IsOptional, IsEnum, IsArray, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFMSCaseDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'FMS case designator (e.g., AA-D-SAA)' })
  @IsString()
  caseDesignator: string;

  @ApiProperty({ description: 'Purchasing country' })
  @IsString()
  country: string;

  @ApiProperty({ description: 'Case description' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Total estimated case value' })
  @IsNumber()
  totalValue: number;

  @ApiProperty({ enum: ['defense_articles', 'defense_services', 'design_construction', 'training'] })
  @IsEnum(['defense_articles', 'defense_services', 'design_construction', 'training'])
  caseType: string;

  @ApiPropertyOptional({ description: 'Implementing agency code' })
  @IsOptional()
  @IsString()
  implementingAgency?: string;

  @ApiPropertyOptional({ description: 'LOA data as JSON' })
  @IsOptional()
  @IsObject()
  loaData?: Record<string, unknown>;
}

export class RecordTrustFundTransactionDto {
  @ApiProperty({ description: 'FMS case ID' })
  @IsString()
  caseId: string;

  @ApiProperty({ description: 'Transaction amount' })
  @IsNumber()
  amount: number;

  @ApiProperty({ enum: ['deposit', 'disbursement'] })
  @IsEnum(['deposit', 'disbursement'])
  transactionType: string;

  @ApiProperty({ description: 'Source or purpose of transaction' })
  @IsString()
  description: string;
}

export class AdvanceCasePhaseDto {
  @ApiProperty({ description: 'FMS case ID' })
  @IsString()
  caseId: string;

  @ApiProperty({ enum: ['loa_preparation', 'loa_accepted', 'implementation', 'delivery', 'billing', 'collection', 'closeout'] })
  @IsEnum(['loa_preparation', 'loa_accepted', 'implementation', 'delivery', 'billing', 'collection', 'closeout'])
  newPhase: string;
}
