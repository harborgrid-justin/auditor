import { IsString, IsNumber, IsOptional, IsInt, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAdaViolationDto {
  @ApiProperty({ description: 'Engagement ID this violation belongs to' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Appropriation ID associated with the violation' })
  @IsString()
  appropriationId: string;

  @ApiProperty({
    description: 'Type of ADA violation',
    enum: ['over_obligation', 'over_expenditure', 'unauthorized_purpose', 'advance_recording'],
  })
  @IsEnum(['over_obligation', 'over_expenditure', 'unauthorized_purpose', 'advance_recording'])
  violationType: string;

  @ApiProperty({ description: 'Statutory basis (e.g., 31 U.S.C. 1341(a))', example: '31 U.S.C. 1341(a)' })
  @IsString()
  statutoryBasis: string;

  @ApiProperty({ description: 'Amount of the violation' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Description of the violation' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Date the violation was discovered (ISO string)' })
  @IsOptional()
  @IsString()
  discoveredDate?: string;

  @ApiPropertyOptional({
    description: 'Investigation status',
    enum: ['detected', 'under_investigation', 'confirmed', 'resolved', 'reported'],
    default: 'detected',
  })
  @IsOptional()
  @IsEnum(['detected', 'under_investigation', 'confirmed', 'resolved', 'reported'])
  investigationStatus?: string;

  @ApiPropertyOptional({ description: 'Fiscal year' })
  @IsOptional()
  @IsInt()
  fiscalYear?: number;
}

export class UpdateAdaViolationDto {
  @ApiPropertyOptional({
    enum: ['detected', 'under_investigation', 'confirmed', 'resolved', 'reported'],
  })
  @IsOptional()
  @IsEnum(['detected', 'under_investigation', 'confirmed', 'resolved', 'reported'])
  investigationStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Corrective action taken' })
  @IsOptional()
  @IsString()
  correctiveAction?: string;

  @ApiPropertyOptional({ description: 'Date reported to Congress/OMB (ISO string)' })
  @IsOptional()
  @IsString()
  reportedDate?: string;
}

export class ValidateAdaDto {
  @ApiProperty({ description: 'Appropriation ID to validate against' })
  @IsString()
  appropriationId: string;

  @ApiProperty({ description: 'Amount to validate' })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ description: 'Fiscal year' })
  @IsOptional()
  @IsInt()
  fiscalYear?: number;
}
