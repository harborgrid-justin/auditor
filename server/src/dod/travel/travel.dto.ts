import { IsString, IsNumber, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTravelOrderDto {
  @ApiProperty({ description: 'Engagement ID this travel order belongs to' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Traveler ID' })
  @IsString()
  travelerId: string;

  @ApiProperty({ description: 'Order type (e.g., tdy, pcs, permissive, emergency)' })
  @IsString()
  orderType: string;

  @ApiProperty({ description: 'Purpose of travel' })
  @IsString()
  purpose: string;

  @ApiProperty({ description: 'Origin location' })
  @IsString()
  originLocation: string;

  @ApiProperty({ description: 'Destination location' })
  @IsString()
  destinationLocation: string;

  @ApiProperty({ description: 'Departure date (ISO string)' })
  @IsString()
  departDate: string;

  @ApiProperty({ description: 'Return date (ISO string)' })
  @IsString()
  returnDate: string;

  @ApiProperty({ description: 'Authorized travel amount' })
  @IsNumber()
  authorizedAmount: number;

  @ApiPropertyOptional({ description: 'Actual travel amount', default: 0 })
  @IsOptional()
  @IsNumber()
  actualAmount?: number;

  @ApiProperty({ description: 'Per diem rate' })
  @IsNumber()
  perDiemRate: number;

  @ApiProperty({ description: 'Lodging rate' })
  @IsNumber()
  lodgingRate: number;

  @ApiPropertyOptional({ description: 'Meals & Incidental Expenses rate', default: 0 })
  @IsOptional()
  @IsNumber()
  mieRate?: number;

  @ApiPropertyOptional({ description: 'Status', default: 'authorized' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ description: 'Authorizing official name or ID' })
  @IsString()
  authorizingOfficial: string;

  @ApiPropertyOptional({ description: 'Fiscal year' })
  @IsOptional()
  @IsInt()
  fiscalYear?: number;
}

export class UpdateTravelOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  actualAmount?: number;

  @ApiPropertyOptional({ enum: ['authorized', 'in_progress', 'completed', 'voucher_submitted', 'settled', 'cancelled'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  authorizedAmount?: number;
}
