import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSpecialAccountDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Account name' })
  @IsString()
  accountName: string;

  @ApiProperty({
    description: 'Account type',
    enum: ['fms_trust', 'environmental_restoration', 'deposit_fund', 'clearing_account', 'suspense', 'working_capital', 'trust_revolving'],
  })
  @IsEnum(['fms_trust', 'environmental_restoration', 'deposit_fund', 'clearing_account', 'suspense', 'working_capital', 'trust_revolving'])
  accountType: string;

  @ApiProperty({ description: 'Account balance' })
  @IsNumber()
  balance: number;

  @ApiProperty({ description: 'Total receipts' })
  @IsNumber()
  receipts: number;

  @ApiProperty({ description: 'Total disbursements' })
  @IsNumber()
  disbursements: number;

  @ApiProperty({ description: 'Total transfers in' })
  @IsNumber()
  transfersIn: number;

  @ApiProperty({ description: 'Total transfers out' })
  @IsNumber()
  transfersOut: number;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateSpecialAccountDto {
  @ApiProperty({ description: 'Special account ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Updated balance' })
  @IsNumber()
  balance: number;

  @ApiProperty({ description: 'Updated receipts' })
  @IsNumber()
  receipts: number;

  @ApiProperty({ description: 'Updated disbursements' })
  @IsNumber()
  disbursements: number;

  @ApiProperty({ description: 'Updated transfers in' })
  @IsNumber()
  transfersIn: number;

  @ApiProperty({ description: 'Updated transfers out' })
  @IsNumber()
  transfersOut: number;
}

export class RunSpecialAccountAnalysisDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;
}
