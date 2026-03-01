import { IsString, IsNumber, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateObligationDto {
  @ApiProperty({ description: 'Engagement ID this obligation belongs to' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Appropriation ID to obligate against' })
  @IsString()
  appropriationId: string;

  @ApiProperty({ description: 'Obligation document number' })
  @IsString()
  obligationNumber: string;

  @ApiProperty({ description: 'Document type (e.g., purchase_order, contract, travel_order)' })
  @IsString()
  documentType: string;

  @ApiPropertyOptional({ description: 'Vendor or payee name' })
  @IsOptional()
  @IsString()
  vendorOrPayee?: string;

  @ApiProperty({ description: 'Obligation amount' })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ description: 'Date the obligation was recorded (ISO string)' })
  @IsOptional()
  @IsString()
  obligatedDate?: string;

  @ApiPropertyOptional({ description: 'Bona fide need date (ISO string)' })
  @IsOptional()
  @IsString()
  bonafideNeedDate?: string;

  @ApiPropertyOptional({ description: 'Fiscal year' })
  @IsOptional()
  @IsInt()
  fiscalYear?: number;

  @ApiProperty({ description: 'Budget object code' })
  @IsString()
  budgetObjectCode: string;

  @ApiPropertyOptional({ description: 'Budget activity code' })
  @IsOptional()
  @IsString()
  budgetActivityCode?: string;

  @ApiPropertyOptional({ description: 'Program element code' })
  @IsOptional()
  @IsString()
  programElement?: string;
}

export class UpdateObligationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  liquidatedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  unliquidatedBalance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  adjustmentAmount?: number;

  @ApiPropertyOptional({ enum: ['open', 'partially_liquidated', 'fully_liquidated', 'deobligated'] })
  @IsOptional()
  @IsString()
  status?: string;
}
