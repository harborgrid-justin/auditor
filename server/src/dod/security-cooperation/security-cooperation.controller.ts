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
import { SecurityCooperationService } from './security-cooperation.service';
import { CreateFMSCaseDto, RecordTrustFundTransactionDto, AdvanceCasePhaseDto } from './security-cooperation.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/security-cooperation')
export class SecurityCooperationController {
  constructor(private readonly securityCooperationService: SecurityCooperationService) {}

  @Get()
  @ApiOperation({ summary: 'List FMS cases for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string) {
    const cases = await this.securityCooperationService.findByEngagement(engagementId);
    return { cases };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single FMS case by ID' })
  async findOne(@Param('id') id: string) {
    return this.securityCooperationService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a new FMS case' })
  async create(@Body() dto: CreateFMSCaseDto) {
    return this.securityCooperationService.create(dto);
  }

  @Post('advance-phase')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Advance FMS case to next lifecycle phase' })
  async advancePhase(@Body() dto: AdvanceCasePhaseDto) {
    return this.securityCooperationService.advancePhase(dto);
  }

  @Post('trust-fund')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Record a trust fund transaction' })
  async recordTrustFundTransaction(@Body() dto: RecordTrustFundTransactionDto) {
    return this.securityCooperationService.recordTrustFundTransaction(dto);
  }

  @Get(':id/congressional-notification')
  @ApiOperation({ summary: 'Check if case requires congressional notification' })
  async checkCongressionalNotification(@Param('id') id: string) {
    return this.securityCooperationService.checkCongressionalNotification(id);
  }

  @Get('reports/status')
  @ApiOperation({ summary: 'Get FMS case status report for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async getCaseStatusReport(@Query('engagementId') engagementId: string) {
    return this.securityCooperationService.getCaseStatusReport(engagementId);
  }
}
