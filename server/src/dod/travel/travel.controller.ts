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
import { TravelService } from './travel.service';
import { CreateTravelOrderDto, UpdateTravelOrderDto } from './travel.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/travel')
export class TravelController {
  constructor(private readonly travelService: TravelService) {}

  @Get()
  @ApiOperation({ summary: 'List travel orders for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string) {
    const orders = await this.travelService.findByEngagement(engagementId);
    return { orders };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single travel order by ID' })
  async findOne(@Param('id') id: string) {
    return this.travelService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a new travel order' })
  async create(@Body() dto: CreateTravelOrderDto) {
    return this.travelService.create(dto);
  }

  @Put(':id')
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Update a travel order' })
  async update(@Param('id') id: string, @Body() dto: UpdateTravelOrderDto) {
    return this.travelService.update(id, dto);
  }
}
