import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDisbursementDto {
  @ApiProperty({ description: 'Engagement ID this disbursement belongs to' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Obligation ID to disburse against' })
  @IsString()
  obligationId: string;

  @ApiProperty({ description: 'Disbursement document number' })
  @IsString()
  disbursementNumber: string;

  @ApiPropertyOptional({ description: 'Voucher number' })
  @IsOptional()
  @IsString()
  voucherNumber?: string;

  @ApiPropertyOptional({ description: 'Payee ID' })
  @IsOptional()
  @IsString()
  payeeId?: string;

  @ApiProperty({ description: 'Disbursement amount' })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ description: 'Disbursement date (ISO string)' })
  @IsOptional()
  @IsString()
  disbursementDate?: string;

  @ApiProperty({ description: 'Payment method (e.g., eft, check, wire, gpc)' })
  @IsString()
  paymentMethod: string;

  @ApiPropertyOptional({ description: 'Certifying official name or ID' })
  @IsOptional()
  @IsString()
  certifiedBy?: string;

  @ApiPropertyOptional({ description: 'Prompt Pay Act due date (ISO string)' })
  @IsOptional()
  @IsString()
  promptPayDueDate?: string;

  @ApiPropertyOptional({ description: 'Discount date (ISO string)' })
  @IsOptional()
  @IsString()
  discountDate?: string;

  @ApiPropertyOptional({ description: 'Discount amount', default: 0 })
  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @ApiPropertyOptional({ description: 'Interest penalty amount', default: 0 })
  @IsOptional()
  @IsNumber()
  interestPenalty?: number;
}

export class UpdateDisbursementDto {
  @ApiPropertyOptional({ enum: ['pending', 'processed', 'confirmed', 'returned', 'cancelled'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  certifiedBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  interestPenalty?: number;
}
