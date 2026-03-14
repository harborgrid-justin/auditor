import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrganizationsService } from './organizations.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  RollupReportDto,
} from './organizations.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all organizations' })
  async findAll() {
    const organizations = await this.organizationsService.findAll();
    return { organizations };
  }

  @Get('tree')
  @ApiOperation({ summary: 'Get organization hierarchy tree' })
  async getTree() {
    return this.organizationsService.getTree();
  }

  @Get('validate')
  @ApiOperation({ summary: 'Validate hierarchy integrity' })
  async validateHierarchy() {
    return this.organizationsService.validateHierarchy();
  }

  @Get('component-summaries')
  @ApiOperation({ summary: 'Get component-level summaries' })
  @ApiQuery({ name: 'engagementId', required: true })
  async getComponentSummaries(@Query('engagementId') engagementId: string) {
    return this.organizationsService.getComponentSummaries(engagementId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single organization' })
  async findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Get(':id/descendants')
  @ApiOperation({ summary: 'Get all descendants of an organization' })
  async getDescendants(@Param('id') id: string) {
    const descendants = await this.organizationsService.getDescendants(id);
    return { descendants };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new organization' })
  async create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Post('update')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @ApiOperation({ summary: 'Update an organization' })
  async update(@Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.update(dto);
  }

  @Post('rollup')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'auditor')
  @ApiOperation({ summary: 'Generate roll-up report for an organization' })
  async getRollup(@Body() dto: RollupReportDto) {
    return this.organizationsService.getRollup(dto);
  }
}
