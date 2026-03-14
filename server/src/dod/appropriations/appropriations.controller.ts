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
import { AppropriationsService } from './appropriations.service';
import { CreateAppropriationDto, UpdateAppropriationDto } from './appropriations.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/appropriations')
export class AppropriationsController {
  constructor(private readonly appropriationsService: AppropriationsService) {}

  @Get()
  @ApiOperation({ summary: 'List appropriations for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string, @Query() pagination: PaginationQueryDto) {
    const appropriations = await this.appropriationsService.findByEngagement(engagementId, pagination);
    return { appropriations };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single appropriation by ID' })
  async findOne(@Param('id') id: string) {
    return this.appropriationsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a new appropriation record' })
  async create(@Body() dto: CreateAppropriationDto) {
    return this.appropriationsService.create(dto);
  }

  @Put(':id')
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Update an appropriation record' })
  async update(@Param('id') id: string, @Body() dto: UpdateAppropriationDto) {
    return this.appropriationsService.update(id, dto);
  }
}
