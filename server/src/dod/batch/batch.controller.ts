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
import { BatchService } from './batch.service';
import { StartBatchDto, CancelBatchDto } from './batch.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/batch')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Start a new batch processing operation' })
  async startBatch(@Body() dto: StartBatchDto) {
    return this.batchService.startBatch(dto);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get the current status of a batch' })
  async getBatchStatus(@Param('id') id: string) {
    return this.batchService.getBatchStatus(id);
  }

  @Get(':id/errors')
  @ApiOperation({ summary: 'Get detailed error list for a batch' })
  async getBatchErrors(@Param('id') id: string) {
    return this.batchService.getBatchErrors(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller')
  @ApiOperation({ summary: 'Cancel an in-progress batch' })
  async cancelBatch(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.batchService.cancelBatch({ batchId: id, reason: body.reason });
  }

  @Get()
  @ApiOperation({ summary: 'List batch history for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async getBatchHistory(@Query('engagementId') engagementId: string) {
    const batches = await this.batchService.getBatchHistory(engagementId);
    return { batches };
  }
}
