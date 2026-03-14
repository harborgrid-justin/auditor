import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({ description: 'Parent organization ID (null for root)' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ description: 'Organization code (e.g., "ARMY", "TRADOC")' })
  @IsString()
  code: string;

  @ApiProperty({ description: 'Full organization name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Abbreviation' })
  @IsString()
  abbreviation: string;

  @ApiProperty({
    enum: ['osd', 'military_department', 'defense_agency', 'field_activity', 'combatant_command', 'sub_component', 'installation', 'activity', 'program_office'],
  })
  @IsEnum(['osd', 'military_department', 'defense_agency', 'field_activity', 'combatant_command', 'sub_component', 'installation', 'activity', 'program_office'])
  componentType: string;

  @ApiPropertyOptional({ description: 'DoD component code' })
  @IsOptional()
  @IsString()
  dodComponentCode?: string;

  @ApiPropertyOptional({ description: 'Treasury agency code' })
  @IsOptional()
  @IsString()
  treasuryAgencyCode?: string;
}

export class UpdateOrganizationDto {
  @ApiProperty({ description: 'Organization ID' })
  @IsString()
  id: string;

  @ApiPropertyOptional({ description: 'Updated name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Updated status' })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'reorganizing'])
  status?: string;
}

export class RollupReportDto {
  @ApiProperty({ description: 'Root organization ID for roll-up' })
  @IsString()
  organizationId: string;

  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Fiscal year' })
  @IsNumber()
  fiscalYear: number;
}
