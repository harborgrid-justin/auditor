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
import { ObligationsService } from './obligations.service';
import { CreateObligationDto, UpdateObligationDto } from './obligations.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/obligations')
export class ObligationsController {
  constructor(private readonly obligationsService: ObligationsService) {}

  @Get()
  @ApiOperation({ summary: 'List obligations for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string) {
    const obligations = await this.obligationsService.findByEngagement(engagementId);
    return { obligations };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single obligation by ID' })
  async findOne(@Param('id') id: string) {
    return this.obligationsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'auditor', 'comptroller', 'fund_control_officer')
  @ApiOperation({ summary: 'Create a new obligation with ADA validation' })
  async create(@Body() dto: CreateObligationDto) {
    return this.obligationsService.create(dto);
  }

  @Put(':id')
  @Roles('admin', 'auditor', 'comptroller', 'fund_control_officer')
  @ApiOperation({ summary: 'Update an obligation record' })
  async update(@Param('id') id: string, @Body() dto: UpdateObligationDto) {
    return this.obligationsService.update(id, dto);
  }
}
