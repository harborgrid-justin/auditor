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
import { ContractsService } from './contracts.service';
import { CreateContractDto, UpdateContractDto } from './contracts.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @ApiOperation({ summary: 'List contracts for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async findAll(
    @Query('engagementId') engagementId: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.contractsService.findByEngagement(engagementId, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single contract by ID' })
  async findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a new contract record' })
  async create(@Body() dto: CreateContractDto) {
    return this.contractsService.create(dto);
  }

  @Put(':id')
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Update a contract record' })
  async update(@Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.contractsService.update(id, dto);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Bulk create contract records' })
  async bulkCreate(@Body() dtos: CreateContractDto[]) {
    return this.contractsService.bulkCreate(dtos);
  }
}
