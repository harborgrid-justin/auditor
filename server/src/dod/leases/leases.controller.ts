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
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { LeasesService } from './leases.service';
import { CreateLeaseDto, ClassifyLeaseDto, GenerateAmortizationDto } from './leases.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/leases')
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Get()
  @ApiOperation({ summary: 'List leases for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string, @Query() pagination: PaginationQueryDto) {
    const leases = await this.leasesService.findByEngagement(engagementId, pagination);
    return { leases };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single lease by ID' })
  async findOne(@Param('id') id: string) {
    return this.leasesService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a new lease record' })
  async create(@Body() dto: CreateLeaseDto) {
    return this.leasesService.create(dto);
  }

  @Post('classify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Classify a lease per SFFAS 54' })
  async classifyLease(@Body() dto: ClassifyLeaseDto) {
    return this.leasesService.classifyLease(dto.leaseId);
  }

  @Post('amortization')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate amortization schedule for a lease' })
  async generateAmortization(@Body() dto: GenerateAmortizationDto) {
    return this.leasesService.generateAmortizationSchedule(dto.leaseId);
  }

  @Get('reports/disclosures')
  @ApiOperation({ summary: 'Get lease disclosure summary for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async getDisclosureSummary(@Query('engagementId') engagementId: string) {
    return this.leasesService.getLeaseDisclosureSummary(engagementId);
  }
}
