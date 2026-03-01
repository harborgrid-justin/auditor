import { IsString, IsNumber, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitIGTTransactionDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Transaction type (buy or sell)' })
  @IsEnum(['buy', 'sell'])
  transactionType: string;

  @ApiProperty({ description: 'Trading partner agency TAS' })
  @IsString()
  tradingPartnerTAS: string;

  @ApiProperty({ description: 'Own agency TAS' })
  @IsString()
  ownTAS: string;

  @ApiProperty({ description: 'Transaction amount' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Accounting period (e.g., 2025-Q1)' })
  @IsString()
  period: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class RunReconciliationDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Reconciliation period (e.g., 2025-Q1)' })
  @IsString()
  period: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;
}

export class CreateDisputeDto {
  @ApiProperty({ description: 'Discrepancy ID' })
  @IsString()
  discrepancyId: string;

  @ApiProperty({ description: 'Initiating agency' })
  @IsString()
  initiatingAgency: string;

  @ApiPropertyOptional({ description: 'Dispute description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class ResolveDisputeDto {
  @ApiProperty({ description: 'Dispute ID' })
  @IsString()
  disputeId: string;

  @ApiProperty({ enum: ['accepted_buyer', 'accepted_seller', 'split', 'written_off'] })
  @IsEnum(['accepted_buyer', 'accepted_seller', 'split', 'written_off'])
  resolution: string;

  @ApiPropertyOptional({ description: 'Resolution amount (for split)' })
  @IsOptional()
  @IsNumber()
  resolvedAmount?: number;
}
