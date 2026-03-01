import { IsString, IsNumber, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContractDto {
  @ApiProperty({ description: 'Engagement ID this contract belongs to' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Contract number (e.g., W91WAW-24-C-0001)' })
  @IsString()
  contractNumber: string;

  @ApiProperty({ description: 'Contract type (e.g., firm_fixed_price, cost_plus, time_and_materials, idiq)' })
  @IsString()
  contractType: string;

  @ApiProperty({ description: 'Vendor name' })
  @IsString()
  vendorName: string;

  @ApiProperty({ description: 'Total contract value' })
  @IsNumber()
  totalValue: number;

  @ApiPropertyOptional({ description: 'Amount obligated against the contract', default: 0 })
  @IsOptional()
  @IsNumber()
  obligatedAmount?: number;

  @ApiPropertyOptional({ description: 'Amount funded (incremental funding)', default: 0 })
  @IsOptional()
  @IsNumber()
  fundedAmount?: number;

  @ApiProperty({ description: 'Period of performance (e.g., 12 months, Base + 4 Options)' })
  @IsString()
  periodOfPerformance: string;

  @ApiProperty({ description: 'Contracting officer name' })
  @IsString()
  contractingOfficer: string;

  @ApiPropertyOptional({ description: 'Status', default: 'active' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Closeout date (ISO string)' })
  @IsOptional()
  @IsString()
  closeoutDate?: string;

  @ApiPropertyOptional({ description: 'Fiscal year' })
  @IsOptional()
  @IsInt()
  fiscalYear?: number;
}

export class UpdateContractDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  totalValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  obligatedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  fundedAmount?: number;

  @ApiPropertyOptional({ enum: ['active', 'completed', 'terminated', 'closeout', 'closed'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  closeoutDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractingOfficer?: string;
}
