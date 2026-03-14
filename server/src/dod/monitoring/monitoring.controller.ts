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
import { MonitoringService } from './monitoring.service';
import {
  GenerateSnapshotDto,
  ConfigureAlertDto,
} from './monitoring.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Post('snapshot')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'auditor')
  @ApiOperation({ summary: 'Generate a continuous monitoring snapshot' })
  async generateSnapshot(@Body() dto: GenerateSnapshotDto) {
    return this.monitoringService.generateSnapshot(dto);
  }

  @Post('alerts/configure')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller')
  @ApiOperation({ summary: 'Configure an alert threshold' })
  async configureAlert(@Body() dto: ConfigureAlertDto) {
    return this.monitoringService.configureAlert(dto);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get alerts for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  @ApiQuery({ name: 'fiscalYear', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'acknowledged', 'resolved'] })
  async getAlerts(
    @Query('engagementId') engagementId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('status') status?: string,
  ) {
    return this.monitoringService.getAlerts({
      engagementId,
      fiscalYear: fiscalYear ? parseInt(fiscalYear, 10) : undefined,
      status: status as any,
    });
  }

  @Post('alerts/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Acknowledge an alert' })
  async acknowledgeAlert(@Param('id') id: string) {
    return this.monitoringService.acknowledgeAlert(id);
  }

  @Get('metrics/history')
  @ApiOperation({ summary: 'Get historical metric values for trending' })
  @ApiQuery({ name: 'engagementId', required: true })
  @ApiQuery({ name: 'metric', required: true })
  @ApiQuery({ name: 'periods', required: false })
  async getMetricsHistory(
    @Query('engagementId') engagementId: string,
    @Query('metric') metric: string,
    @Query('periods') periods?: string,
  ) {
    return this.monitoringService.getMetricsHistory(
      engagementId,
      metric,
      periods ? parseInt(periods, 10) : 12,
    );
  }
}
