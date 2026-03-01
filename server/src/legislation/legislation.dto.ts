import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DoDEngagementData } from '../../../src/types/dod-fmr';
import type { NDAASectionChange, NDAASectionParameterUpdate } from '../../../src/lib/engine/legislation/ndaa-change-processor';
import type { EscalationType, IndexType, IndexDataPoint } from '../../../src/lib/engine/legislation/threshold-escalation';

export class RegisterRuleVersionDto {
  @ApiProperty() ruleId!: string;
  @ApiProperty() version!: number;
  @ApiProperty() contentJson!: string;
  @ApiProperty() effectiveDate!: string;
  @ApiPropertyOptional() sunsetDate?: string;
  @ApiProperty() changedBy!: string;
  @ApiProperty() changeReason!: string;
  @ApiPropertyOptional() legislationId?: string;
}

export class ProcessNDAAPackageDto {
  @ApiProperty() fiscalYear!: number;
  @ApiProperty() publicLawNumber!: string;
  @ApiProperty() enactmentDate!: string;
  @ApiProperty() sections!: NDAASectionChange[];
  @ApiProperty() processedBy!: string;
}

export class RegisterEscalationRuleDto {
  @ApiProperty() parameterCode!: string;
  @ApiProperty() escalationType!: EscalationType;
  @ApiPropertyOptional() indexType?: IndexType;
  @ApiPropertyOptional() fixedRate?: number;
  @ApiProperty() roundingRule!: 'none' | 'nearest_dollar' | 'nearest_hundred' | 'nearest_thousand';
  @ApiProperty() authority!: string;
  @ApiProperty() frequency!: 'annual' | 'biennial' | 'quinquennial';
  @ApiProperty() effectiveMonth!: number;
  @ApiProperty() active!: boolean;
  @ApiPropertyOptional() maxEscalationPct?: number;
  @ApiPropertyOptional() minEscalationPct?: number;
}

export class LoadIndexDataDto {
  @ApiProperty() dataPoints!: IndexDataPoint[];
}

export class EscalateParameterDto {
  @ApiProperty() parameterCode!: string;
  @ApiProperty() baseValue!: number;
  @ApiProperty() baseFiscalYear!: number;
  @ApiProperty() targetFiscalYear!: number;
}

export class PerformRolloverDto {
  @ApiProperty() engagementData!: DoDEngagementData;
  @ApiProperty() closingFiscalYear!: number;
  @ApiProperty() performedBy!: string;
}
