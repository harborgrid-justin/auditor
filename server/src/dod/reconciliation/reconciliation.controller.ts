import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReconciliationService } from './reconciliation.service';
import {
  SubmitPurchaseOrderDto,
  SubmitReceiptDto,
  SubmitInvoiceDto,
  RunMatchingDto,
  CreateSuspenseItemDto,
  ClearSuspenseItemDto,
} from './reconciliation.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('po')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Submit a purchase order for three-way matching' })
  async submitPO(@Body() dto: SubmitPurchaseOrderDto) {
    return this.reconciliationService.submitPO(dto);
  }

  @Post('receipt')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Submit a receipt/acceptance report' })
  async submitReceipt(@Body() dto: SubmitReceiptDto) {
    return this.reconciliationService.submitReceipt(dto);
  }

  @Post('invoice')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Submit a vendor invoice' })
  async submitInvoice(@Body() dto: SubmitInvoiceDto) {
    return this.reconciliationService.submitInvoice(dto);
  }

  @Post('match')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'auditor')
  @ApiOperation({ summary: 'Run three-way match for purchase orders' })
  async runMatching(@Body() dto: RunMatchingDto) {
    return this.reconciliationService.runMatching(dto);
  }

  @Get('match-results')
  @ApiOperation({ summary: 'Get three-way match results' })
  @ApiQuery({ name: 'engagementId', required: true })
  async getMatchResults(@Query('engagementId') engagementId: string) {
    return this.reconciliationService.getMatchResults(engagementId);
  }

  @Post('suspense')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a suspense item' })
  async createSuspenseItem(@Body() dto: CreateSuspenseItemDto) {
    return this.reconciliationService.createSuspenseItem(dto);
  }

  @Post('suspense/clear')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Clear a suspense item' })
  async clearSuspenseItem(@Body() dto: ClearSuspenseItemDto) {
    return this.reconciliationService.clearSuspenseItem(dto);
  }

  @Get('suspense')
  @ApiOperation({ summary: 'List suspense items for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async getSuspenseItems(@Query('engagementId') engagementId: string) {
    return this.reconciliationService.getSuspenseItems(engagementId);
  }

  @Get('suspense/analysis')
  @ApiOperation({ summary: 'Get suspense account aging analysis' })
  @ApiQuery({ name: 'engagementId', required: true })
  async getSuspenseAnalysis(@Query('engagementId') engagementId: string) {
    return this.reconciliationService.getSuspenseAnalysis(engagementId);
  }
}
