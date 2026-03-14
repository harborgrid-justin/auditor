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
import { ReimbursableService } from './reimbursable.service';
import {
  CreateInteragencyAgreementDto,
  UpdateIAAStatusDto,
  CreateWorkingCapitalFundDto,
  RunIAAAnalysisDto,
} from './reimbursable.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/reimbursable')
export class ReimbursableController {
  constructor(private readonly reimbursableService: ReimbursableService) {}

  @Get()
  @ApiOperation({ summary: 'List interagency agreements for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string) {
    const agreements = await this.reimbursableService.findByEngagement(engagementId);
    return { agreements };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single interagency agreement by ID' })
  async findOne(@Param('id') id: string) {
    return this.reimbursableService.findOne(id);
  }

  @Post('agreement')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create an interagency agreement' })
  async createAgreement(@Body() dto: CreateInteragencyAgreementDto) {
    return this.reimbursableService.createAgreement(dto);
  }

  @Post('agreement/status')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Update interagency agreement status' })
  async updateStatus(@Body() dto: UpdateIAAStatusDto) {
    return this.reimbursableService.updateStatus(dto);
  }

  @Post('wcf')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a working capital fund record' })
  async createWorkingCapitalFund(@Body() dto: CreateWorkingCapitalFundDto) {
    return this.reimbursableService.createWorkingCapitalFund(dto);
  }

  @Get('wcf')
  @ApiOperation({ summary: 'List working capital funds for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findWorkingCapitalFunds(@Query('engagementId') engagementId: string) {
    const funds = await this.reimbursableService.findWorkingCapitalFunds(engagementId);
    return { funds };
  }

  @Post('analysis')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'auditor')
  @ApiOperation({ summary: 'Run reimbursable operations analysis' })
  async runAnalysis(@Body() dto: RunIAAAnalysisDto) {
    return this.reimbursableService.runAnalysis(dto);
  }
}
