import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum BatchType {
  OBLIGATION_IMPORT = 'obligation_import',
  DISBURSEMENT_IMPORT = 'disbursement_import',
  JOURNAL_ENTRY_IMPORT = 'journal_entry_import',
  PAYROLL_PROCESSING = 'payroll_processing',
  YEAR_END_CLOSE = 'year_end_close',
}

export class StartBatchDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({
    description: 'Type of batch operation',
    enum: BatchType,
    example: BatchType.OBLIGATION_IMPORT,
  })
  @IsEnum(BatchType)
  batchType: BatchType;

  @ApiProperty({ description: 'Fiscal year for the batch' })
  @IsNumber()
  fiscalYear: number;

  @ApiPropertyOptional({
    description: 'Validate only without committing changes',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiProperty({
    description: 'Array of records to process',
    type: 'array',
    items: { type: 'object' },
  })
  @IsArray()
  data: Record<string, any>[];
}

export class GetBatchStatusDto {
  @ApiProperty({ description: 'Batch ID' })
  @IsString()
  batchId: string;
}

export class CancelBatchDto {
  @ApiProperty({ description: 'Batch ID' })
  @IsString()
  batchId: string;

  @ApiProperty({ description: 'Reason for cancellation' })
  @IsString()
  reason: string;
}
