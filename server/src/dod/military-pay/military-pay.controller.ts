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
import { MilitaryPayService } from './military-pay.service';
import { CreateMilitaryPayDto, UpdateMilitaryPayDto } from './military-pay.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/military-pay')
export class MilitaryPayController {
  constructor(private readonly militaryPayService: MilitaryPayService) {}

  @Get()
  @ApiOperation({ summary: 'List military pay records for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string, @Query() pagination: PaginationQueryDto) {
    const records = await this.militaryPayService.findByEngagement(engagementId, pagination);
    return { records };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single military pay record by ID' })
  async findOne(@Param('id') id: string) {
    return this.militaryPayService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a new military pay record' })
  async create(@Body() dto: CreateMilitaryPayDto) {
    return this.militaryPayService.create(dto);
  }

  @Put(':id')
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Update a military pay record' })
  async update(@Param('id') id: string, @Body() dto: UpdateMilitaryPayDto) {
    return this.militaryPayService.update(id, dto);
  }
}
