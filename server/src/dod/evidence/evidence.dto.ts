import { IsString, IsNumber, IsOptional, IsEnum, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateEvidencePackageDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;

  @ApiPropertyOptional({
    description: 'Sections to include (defaults to all)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sections?: string[];

  @ApiPropertyOptional({ description: 'Include workpapers', default: true })
  @IsOptional()
  @IsBoolean()
  includeWorkpapers?: boolean;

  @ApiPropertyOptional({ description: 'Include audit logs', default: true })
  @IsOptional()
  @IsBoolean()
  includeAuditLogs?: boolean;

  @ApiPropertyOptional({
    enum: ['unclassified', 'cui', 'cui_specified', 'fouo'],
    default: 'unclassified',
  })
  @IsOptional()
  @IsEnum(['unclassified', 'cui', 'cui_specified', 'fouo'])
  classification?: string;
}
