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
import { CivilianPayService } from './civilian-pay.service';
import { CreateCivilianPayDto, UpdateCivilianPayDto } from './civilian-pay.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/civilian-pay')
export class CivilianPayController {
  constructor(private readonly civilianPayService: CivilianPayService) {}

  @Get()
  @ApiOperation({ summary: 'List civilian pay records for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string) {
    const records = await this.civilianPayService.findByEngagement(engagementId);
    return { records };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single civilian pay record by ID' })
  async findOne(@Param('id') id: string) {
    return this.civilianPayService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a new civilian pay record' })
  async create(@Body() dto: CreateCivilianPayDto) {
    return this.civilianPayService.create(dto);
  }

  @Put(':id')
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Update a civilian pay record' })
  async update(@Param('id') id: string, @Body() dto: UpdateCivilianPayDto) {
    return this.civilianPayService.update(id, dto);
  }
}
