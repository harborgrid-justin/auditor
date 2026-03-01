import { IsString, IsNumber, IsOptional, IsEnum, IsArray, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateStatementDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;

  @ApiProperty({
    enum: [
      'balance_sheet',
      'net_cost',
      'changes_net_position',
      'budgetary_resources',
      'custodial_activity',
      'reconciliation',
    ],
  })
  @IsEnum([
    'balance_sheet',
    'net_cost',
    'changes_net_position',
    'budgetary_resources',
    'custodial_activity',
    'reconciliation',
  ])
  statementType: string;

  @ApiPropertyOptional({ description: 'Include comparative prior year data' })
  @IsOptional()
  comparativeFiscalYear?: number;
}

export class GenerateNoteDisclosuresDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;

  @ApiPropertyOptional({ description: 'Specific note numbers to generate (omit for all)' })
  @IsOptional()
  @IsArray()
  noteNumbers?: number[];
}

export class GenerateFullPackageDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;
}
