import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { RemediationService } from './remediation.service';
import {
  CreateCAPDto,
  UpdateCAPStatusDto,
  CompleteMilestoneDto,
} from './remediation.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/remediation')
export class RemediationController {
  constructor(private readonly remediationService: RemediationService) {}

  @Get()
  @ApiOperation({ summary: 'List corrective action plans for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string, @Query() pagination: PaginationQueryDto) {
    const caps = await this.remediationService.findByEngagement(engagementId, pagination);
    return { caps };
  }

  @Get('fiar-status')
  @ApiOperation({ summary: 'Get FIAR audit readiness status' })
  @ApiQuery({ name: 'engagementId', required: true })
  @ApiQuery({ name: 'fiscalYear', required: true })
  async getFIARStatus(
    @Query('engagementId') engagementId: string,
    @Query('fiscalYear') fiscalYear: string,
  ) {
    return this.remediationService.getFIARStatus({
      engagementId,
      fiscalYear: parseInt(fiscalYear, 10),
    });
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get remediation dashboard summary' })
  @ApiQuery({ name: 'engagementId', required: true })
  async getDashboard(@Query('engagementId') engagementId: string) {
    return this.remediationService.getRemediationDashboard(engagementId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single corrective action plan by ID' })
  async findOne(@Param('id') id: string) {
    return this.remediationService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'auditor')
  @ApiOperation({ summary: 'Create a corrective action plan' })
  async createCAP(@Body() dto: CreateCAPDto) {
    return this.remediationService.createCAP(dto);
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'auditor', 'reviewer')
  @ApiOperation({ summary: 'Update CAP status' })
  async updateStatus(@Body() dto: UpdateCAPStatusDto) {
    return this.remediationService.updateStatus(dto);
  }

  @Post('milestone/complete')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'auditor', 'reviewer')
  @ApiOperation({ summary: 'Complete a milestone with evidence' })
  async completeMilestone(@Body() dto: CompleteMilestoneDto) {
    return this.remediationService.completeMilestone(dto);
  }
}
