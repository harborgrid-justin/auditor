import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { WorkflowsService } from './workflows.service';
import {
  StartWorkflowDto,
  ProcessStepDto,
  ReassignStepDto,
  EscalateStepDto,
} from './workflows.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get('templates')
  @ApiOperation({ summary: 'List available workflow templates' })
  async getTemplates() {
    return { templates: this.workflowsService.getTemplates() };
  }

  @Get()
  @ApiOperation({ summary: 'List workflows for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string) {
    const workflows = await this.workflowsService.getWorkflowsForEngagement(engagementId);
    return { workflows };
  }

  @Get('overdue')
  @ApiOperation({ summary: 'Check for SLA breaches across workflows in an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async checkOverdue(@Query('engagementId') engagementId: string) {
    const breaches = await this.workflowsService.checkOverdueSLAs(engagementId);
    return { breaches, total: breaches.length };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow status by ID' })
  async getStatus(@Param('id') id: string) {
    return this.workflowsService.getWorkflowStatus(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager', 'auditor')
  @ApiOperation({ summary: 'Start a new workflow from a template' })
  async startWorkflow(@Body() dto: StartWorkflowDto, @Req() req: any) {
    const initiatedBy = req.user?.id ?? 'system';
    const instance = await this.workflowsService.startWorkflow(dto, initiatedBy);
    return { workflow: instance };
  }

  @Post('step/process')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager', 'auditor')
  @ApiOperation({ summary: 'Approve or reject a workflow step' })
  async processStep(@Body() dto: ProcessStepDto, @Req() req: any) {
    const actorId = req.user?.id ?? 'system';
    const instance = await this.workflowsService.processStep(dto, actorId);
    return { workflow: instance };
  }

  @Post('step/reassign')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller')
  @ApiOperation({ summary: 'Reassign a pending workflow step to a different user' })
  async reassignStep(@Body() dto: ReassignStepDto) {
    const instance = await this.workflowsService.reassignStep(dto);
    return { workflow: instance };
  }

  @Post('step/escalate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Escalate a pending workflow step' })
  async escalateStep(@Body() dto: EscalateStepDto) {
    const instance = await this.workflowsService.escalateStep(dto);
    return { workflow: instance };
  }
}
