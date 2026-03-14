import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateSnapshotDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;
}

export class ConfigureAlertDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({
    description: 'Metric type to monitor',
    enum: ['fund_execution', 'ada_exposure', 'obligation_aging', 'reconciliation_health', 'payment_integrity'],
  })
  @IsEnum(['fund_execution', 'ada_exposure', 'obligation_aging', 'reconciliation_health', 'payment_integrity'])
  metricType: string;

  @ApiProperty({ description: 'Threshold value that triggers the alert' })
  @IsNumber()
  thresholdValue: number;

  @ApiProperty({
    description: 'Alert severity level',
    enum: ['warning', 'critical'],
  })
  @IsEnum(['warning', 'critical'])
  alertLevel: string;
}

export class GetAlertsDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiPropertyOptional({ description: 'Fiscal year' })
  @IsOptional()
  @IsNumber()
  fiscalYear?: number;

  @ApiPropertyOptional({
    description: 'Alert status filter',
    enum: ['active', 'acknowledged', 'resolved'],
  })
  @IsOptional()
  @IsEnum(['active', 'acknowledged', 'resolved'])
  status?: string;
}
