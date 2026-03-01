import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLeaseDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Lease description' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Lessor name' })
  @IsString()
  lessorName: string;

  @ApiProperty({ description: 'Lease commencement date (ISO 8601)' })
  @IsString()
  commencementDate: string;

  @ApiProperty({ description: 'Lease term in months' })
  @IsNumber()
  termMonths: number;

  @ApiProperty({ description: 'Monthly payment amount' })
  @IsNumber()
  monthlyPayment: number;

  @ApiPropertyOptional({ description: 'Annual discount rate (e.g., 0.035 for 3.5%)' })
  @IsOptional()
  @IsNumber()
  discountRate?: number;

  @ApiPropertyOptional({ description: 'Whether lessor is a federal entity' })
  @IsOptional()
  @IsBoolean()
  isIntragovernmental?: boolean;

  @ApiPropertyOptional({ description: 'Initial direct costs' })
  @IsOptional()
  @IsNumber()
  initialDirectCosts?: number;

  @ApiPropertyOptional({ description: 'Prepayments at commencement' })
  @IsOptional()
  @IsNumber()
  prepayments?: number;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;
}

export class ClassifyLeaseDto {
  @ApiProperty({ description: 'Lease ID' })
  @IsString()
  leaseId: string;
}

export class GenerateAmortizationDto {
  @ApiProperty({ description: 'Lease ID' })
  @IsString()
  leaseId: string;

  @ApiPropertyOptional({ description: 'Number of periods to generate' })
  @IsOptional()
  @IsNumber()
  periods?: number;
}
