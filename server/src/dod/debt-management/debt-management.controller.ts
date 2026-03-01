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
import { DebtManagementService } from './debt-management.service';
import {
  CreateDebtRecordDto,
  GenerateDemandLetterDto,
  EvaluateCompromiseDto,
  InitiateSalaryOffsetDto,
} from './debt-management.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/debt-management')
export class DebtManagementController {
  constructor(private readonly debtManagementService: DebtManagementService) {}

  @Get()
  @ApiOperation({ summary: 'List debt records for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string) {
    const debts = await this.debtManagementService.findByEngagement(engagementId);
    return { debts };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single debt record by ID' })
  async findOne(@Param('id') id: string) {
    return this.debtManagementService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a new debt record' })
  async create(@Body() dto: CreateDebtRecordDto) {
    return this.debtManagementService.create(dto);
  }

  @Post('demand-letter')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Generate a demand letter for a debt' })
  async generateDemandLetter(@Body() dto: GenerateDemandLetterDto) {
    return this.debtManagementService.generateDemandLetter(dto);
  }

  @Post('compromise')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Evaluate a compromise offer' })
  async evaluateCompromise(@Body() dto: EvaluateCompromiseDto) {
    return this.debtManagementService.evaluateCompromise(dto);
  }

  @Post('salary-offset')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Initiate salary offset for a debt' })
  async initiateSalaryOffset(@Body() dto: InitiateSalaryOffsetDto) {
    return this.debtManagementService.initiateSalaryOffset(dto);
  }

  @Get('reports/aging')
  @ApiOperation({ summary: 'Get debt aging report' })
  @ApiQuery({ name: 'engagementId', required: true })
  async getDebtAgingReport(@Query('engagementId') engagementId: string) {
    return this.debtManagementService.getDebtAgingReport(engagementId);
  }

  @Get('reports/referral-deadlines')
  @ApiOperation({ summary: 'Check Treasury referral deadlines' })
  @ApiQuery({ name: 'engagementId', required: true })
  async checkReferralDeadlines(@Query('engagementId') engagementId: string) {
    return this.debtManagementService.checkReferralDeadlines(engagementId);
  }
}
