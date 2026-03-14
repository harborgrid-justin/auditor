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
import { SpecialAccountsService } from './special-accounts.service';
import {
  CreateSpecialAccountDto,
  UpdateSpecialAccountDto,
  RunSpecialAccountAnalysisDto,
} from './special-accounts.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/special-accounts')
export class SpecialAccountsController {
  constructor(private readonly specialAccountsService: SpecialAccountsService) {}

  @Get()
  @ApiOperation({ summary: 'List special accounts for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(@Query('engagementId') engagementId: string, @Query() pagination: PaginationQueryDto) {
    const accounts = await this.specialAccountsService.findByEngagement(engagementId, pagination);
    return { accounts };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single special account by ID' })
  async findOne(@Param('id') id: string) {
    return this.specialAccountsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a special account' })
  async create(@Body() dto: CreateSpecialAccountDto) {
    return this.specialAccountsService.create(dto);
  }

  @Post('update')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Update special account balances' })
  async update(@Body() dto: UpdateSpecialAccountDto) {
    return this.specialAccountsService.update(dto);
  }

  @Post('analysis')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'auditor')
  @ApiOperation({ summary: 'Run Vol 12 special account analysis' })
  async runAnalysis(@Body() dto: RunSpecialAccountAnalysisDto) {
    return this.specialAccountsService.runAnalysis(dto);
  }
}
