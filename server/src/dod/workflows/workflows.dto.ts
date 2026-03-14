import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartWorkflowDto {
  @ApiProperty({
    description: 'Name of the workflow template to use (e.g., "obligation-approval")',
    example: 'obligation-approval',
  })
  @IsString()
  templateName: string;

  @ApiProperty({
    description: 'Type of entity the workflow governs',
    enum: [
      'disbursement',
      'ada_violation',
      'reprogramming',
      'debt_writeoff',
      'report',
      'obligation',
      'journal_entry',
      'year_end_closing',
      'reimbursable_agreement',
    ],
  })
  @IsString()
  entityType: string;

  @ApiProperty({ description: 'ID of the entity being approved' })
  @IsString()
  entityId: string;

  @ApiProperty({ description: 'Engagement this workflow belongs to' })
  @IsString()
  engagementId: string;
}

export class ProcessStepDto {
  @ApiProperty({ description: 'Workflow instance ID' })
  @IsString()
  instanceId: string;

  @ApiProperty({ description: 'Step ID within the workflow instance' })
  @IsString()
  stepId: string;

  @ApiProperty({
    description: 'Approval decision',
    enum: ['approve', 'reject'],
  })
  @IsEnum(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @ApiPropertyOptional({ description: 'Optional comment explaining the decision' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ReassignStepDto {
  @ApiProperty({ description: 'Workflow instance ID' })
  @IsString()
  instanceId: string;

  @ApiProperty({ description: 'Step ID to reassign' })
  @IsString()
  stepId: string;

  @ApiProperty({ description: 'User ID of the new assignee' })
  @IsString()
  newAssigneeId: string;
}

export class EscalateStepDto {
  @ApiProperty({ description: 'Workflow instance ID' })
  @IsString()
  instanceId: string;

  @ApiProperty({ description: 'Step ID to escalate' })
  @IsString()
  stepId: string;

  @ApiProperty({ description: 'Reason for escalation' })
  @IsString()
  reason: string;
}
