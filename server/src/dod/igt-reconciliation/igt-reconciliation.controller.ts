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
import { IGTReconciliationService } from './igt-reconciliation.service';
import {
  SubmitIGTTransactionDto,
  RunReconciliationDto,
  CreateDisputeDto,
  ResolveDisputeDto,
} from './igt-reconciliation.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/igt-reconciliation')
export class IGTReconciliationController {
  constructor(private readonly igtReconciliationService: IGTReconciliationService) {}

  @Get()
  @ApiOperation({ summary: 'List IGT transactions for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string) {
    const transactions = await this.igtReconciliationService.findByEngagement(engagementId);
    return { transactions };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single IGT transaction by ID' })
  async findOne(@Param('id') id: string) {
    return this.igtReconciliationService.findOne(id);
  }

  @Post('transaction')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Submit an IGT buy/sell transaction' })
  async submitTransaction(@Body() dto: SubmitIGTTransactionDto) {
    return this.igtReconciliationService.submitTransaction(dto);
  }

  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'auditor')
  @ApiOperation({ summary: 'Run buy-sell reconciliation for a period' })
  async runReconciliation(@Body() dto: RunReconciliationDto) {
    return this.igtReconciliationService.runReconciliation(dto);
  }

  @Post('dispute')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a dispute for an unmatched transaction' })
  async createDispute(@Body() dto: CreateDisputeDto) {
    return this.igtReconciliationService.createDispute(dto);
  }

  @Post('dispute/resolve')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Resolve a dispute' })
  async resolveDispute(@Body() dto: ResolveDisputeDto) {
    return this.igtReconciliationService.resolveDispute(dto);
  }

  @Get('reports/reconciliation')
  @ApiOperation({ summary: 'Get reconciliation report for a period' })
  @ApiQuery({ name: 'engagementId', required: true })
  @ApiQuery({ name: 'period', required: true })
  async getReconciliationReport(
    @Query('engagementId') engagementId: string,
    @Query('period') period: string,
  ) {
    return this.igtReconciliationService.getReconciliationReport(engagementId, period);
  }
}
