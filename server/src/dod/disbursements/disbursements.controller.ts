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
import { DisbursementsService } from './disbursements.service';
import { CreateDisbursementDto, UpdateDisbursementDto } from './disbursements.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/disbursements')
export class DisbursementsController {
  constructor(private readonly disbursementsService: DisbursementsService) {}

  @Get()
  @ApiOperation({ summary: 'List disbursements for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string) {
    const disbursements = await this.disbursementsService.findByEngagement(engagementId);
    return { disbursements };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single disbursement by ID' })
  async findOne(@Param('id') id: string) {
    return this.disbursementsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'disbursing_officer', 'certifying_officer')
  @ApiOperation({ summary: 'Create a new disbursement with fund control validation' })
  async create(@Body() dto: CreateDisbursementDto) {
    return this.disbursementsService.create(dto);
  }

  @Put(':id')
  @Roles('admin', 'disbursing_officer', 'certifying_officer')
  @ApiOperation({ summary: 'Update a disbursement record' })
  async update(@Param('id') id: string, @Body() dto: UpdateDisbursementDto) {
    return this.disbursementsService.update(id, dto);
  }
}
