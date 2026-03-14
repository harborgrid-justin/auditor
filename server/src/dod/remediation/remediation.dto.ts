import { IsString, IsNumber, IsOptional, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class MilestoneDto {
  @ApiProperty({ description: 'Milestone title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Target completion date' })
  @IsString()
  targetDate: string;
}

export class CreateCAPDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Finding ID this CAP addresses' })
  @IsString()
  findingId: string;

  @ApiProperty({ description: 'CAP title' })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Finding classification',
    enum: ['material_weakness', 'significant_deficiency', 'noncompliance', 'control_deficiency'],
  })
  @IsEnum(['material_weakness', 'significant_deficiency', 'noncompliance', 'control_deficiency'])
  classification: string;

  @ApiProperty({ description: 'Responsible official name' })
  @IsString()
  responsibleOfficial: string;

  @ApiProperty({ description: 'Target completion date' })
  @IsString()
  targetCompletionDate: string;

  @ApiProperty({ description: 'Milestones for the corrective action plan', type: [MilestoneDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones: MilestoneDto[];

  @ApiPropertyOptional({ description: 'CAP description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCAPStatusDto {
  @ApiProperty({ description: 'CAP ID' })
  @IsString()
  capId: string;

  @ApiProperty({
    description: 'New CAP status',
    enum: ['draft', 'active', 'on_track', 'at_risk', 'overdue', 'completed', 'validated'],
  })
  @IsEnum(['draft', 'active', 'on_track', 'at_risk', 'overdue', 'completed', 'validated'])
  status: string;

  @ApiPropertyOptional({ description: 'Status change comment' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class CompleteMilestoneDto {
  @ApiProperty({ description: 'CAP ID' })
  @IsString()
  capId: string;

  @ApiProperty({ description: 'Milestone ID' })
  @IsString()
  milestoneId: string;

  @ApiProperty({ description: 'Evidence description for milestone completion' })
  @IsString()
  evidenceDescription: string;

  @ApiProperty({ description: 'Actual completion date' })
  @IsString()
  completedDate: string;
}

export class GetFIARStatusDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;
}
