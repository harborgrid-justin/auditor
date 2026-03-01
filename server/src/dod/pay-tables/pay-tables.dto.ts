import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LookupMilitaryPayDto {
  @ApiProperty({ description: 'Military grade (e.g., E5, O3, W2)' })
  @IsString()
  grade: string;

  @ApiProperty({ description: 'Years of service' })
  @IsNumber()
  yearsOfService: number;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;
}

export class LookupCivilianPayDto {
  @ApiProperty({ description: 'GS grade (1-15)' })
  @IsNumber()
  grade: number;

  @ApiProperty({ description: 'Step (1-10)' })
  @IsNumber()
  step: number;

  @ApiProperty({ description: 'Locality pay area code' })
  @IsString()
  localityArea: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;
}

export class CalculateMilitaryCompensationDto {
  @ApiProperty({ description: 'Military grade' })
  @IsString()
  grade: string;

  @ApiProperty({ description: 'Years of service' })
  @IsNumber()
  yearsOfService: number;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;

  @ApiPropertyOptional({ description: 'ZIP code for BAH calculation' })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({ description: 'Has dependents (for BAH)' })
  @IsOptional()
  @IsBoolean()
  hasDependents?: boolean;

  @ApiPropertyOptional({ description: 'TSP contribution percentage (0-1)' })
  @IsOptional()
  @IsNumber()
  tspContributionPct?: number;

  @ApiPropertyOptional({ description: 'Is in BRS retirement system' })
  @IsOptional()
  @IsBoolean()
  isBRS?: boolean;
}

export class CalculateCivilianCompensationDto {
  @ApiProperty({ description: 'GS grade' })
  @IsNumber()
  grade: number;

  @ApiProperty({ description: 'Step' })
  @IsNumber()
  step: number;

  @ApiProperty({ description: 'Locality pay area' })
  @IsString()
  localityArea: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;

  @ApiPropertyOptional({ description: 'FERS entry date for contribution rate tier' })
  @IsOptional()
  @IsString()
  fersEntryDate?: string;

  @ApiPropertyOptional({ description: 'TSP contribution percentage' })
  @IsOptional()
  @IsNumber()
  tspContributionPct?: number;

  @ApiPropertyOptional({ description: 'FEHB plan type' })
  @IsOptional()
  @IsString()
  fehbPlanType?: string;

  @ApiPropertyOptional({ description: 'FEHB enrollment type (self, self_plus_one, family)' })
  @IsOptional()
  @IsString()
  fehbEnrollmentType?: string;
}
