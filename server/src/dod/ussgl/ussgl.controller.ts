import {
  Controller,
  Get,
  Post,
  Put,
  Query,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { UssglService } from './ussgl.service';
import { CreateUssglAccountDto, UpdateUssglAccountDto } from './ussgl.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/ussgl')
export class UssglController {
  constructor(private readonly ussglService: UssglService) {}

  @Get()
  @ApiOperation({ summary: 'List USSGL accounts with trial balance for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  @ApiQuery({ name: 'fiscalYear', required: false })
  @ApiQuery({ name: 'trackType', required: false, enum: ['proprietary', 'budgetary', 'all'] })
  async findAll(
    @Query('engagementId') engagementId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('trackType') trackType?: string,
  ) {
    const parsedFiscalYear = fiscalYear ? parseInt(fiscalYear) : undefined;
    return this.ussglService.findByEngagement(engagementId, parsedFiscalYear, trackType);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single USSGL account by ID' })
  async findOne(@Param('id') id: string) {
    return this.ussglService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a new USSGL account record' })
  async create(@Body() dto: CreateUssglAccountDto) {
    return this.ussglService.create(dto);
  }

  @Put(':id')
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Update a USSGL account record' })
  async update(@Param('id') id: string, @Body() dto: UpdateUssglAccountDto) {
    return this.ussglService.update(id, dto);
  }
}
