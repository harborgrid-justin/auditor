import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FundControlQueryDto {
  @ApiProperty({ description: 'Appropriation ID to check fund control for' })
  @IsString()
  appropriationId: string;

  @ApiPropertyOptional({ description: 'Amount to check availability for' })
  @IsOptional()
  @IsNumber()
  amount?: number;
}

export class CreateFundControlDto {
  @ApiProperty({ description: 'Appropriation ID this fund control record belongs to' })
  @IsString()
  appropriationId: string;

  @ApiProperty({ description: 'Control level (e.g., apportionment, allotment, sub_allotment)' })
  @IsString()
  controlLevel: string;

  @ApiProperty({ description: 'Authorized amount at this control level' })
  @IsNumber()
  authorizedAmount: number;

  @ApiPropertyOptional({ description: 'Obligated amount at this control level', default: 0 })
  @IsOptional()
  @IsNumber()
  obligatedAmount?: number;

  @ApiPropertyOptional({ description: 'Expended amount at this control level', default: 0 })
  @IsOptional()
  @IsNumber()
  expendedAmount?: number;

  @ApiPropertyOptional({ description: 'Responsible officer or organization' })
  @IsOptional()
  @IsString()
  responsibleOrg?: string;

  @ApiPropertyOptional({ description: 'Fiscal year' })
  @IsOptional()
  @IsNumber()
  fiscalYear?: number;
}

export class UpdateFundControlDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  authorizedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  obligatedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expendedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsibleOrg?: string;
}
