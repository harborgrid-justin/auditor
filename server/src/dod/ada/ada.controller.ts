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
import { AdaService } from './ada.service';
import { CreateAdaViolationDto, UpdateAdaViolationDto, ValidateAdaDto } from './ada.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/ada')
export class AdaController {
  constructor(private readonly adaService: AdaService) {}

  @Get()
  @ApiOperation({ summary: 'List ADA violations for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string) {
    const violations = await this.adaService.findByEngagement(engagementId);
    return { violations };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single ADA violation by ID' })
  async findOne(@Param('id') id: string) {
    return this.adaService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'ada_investigator', 'comptroller')
  @ApiOperation({ summary: 'Record a new ADA violation' })
  async create(@Body() dto: CreateAdaViolationDto) {
    return this.adaService.create(dto);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'ada_investigator', 'comptroller')
  @ApiOperation({ summary: 'Real-time ADA validation against an appropriation' })
  async validate(@Body() dto: ValidateAdaDto) {
    return this.adaService.validate(dto);
  }

  @Put(':id')
  @Roles('admin', 'ada_investigator', 'comptroller')
  @ApiOperation({ summary: 'Update an ADA violation record' })
  async update(@Param('id') id: string, @Body() dto: UpdateAdaViolationDto) {
    return this.adaService.update(id, dto);
  }
}
