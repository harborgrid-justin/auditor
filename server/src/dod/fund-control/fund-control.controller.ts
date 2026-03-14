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
import { FundControlService } from './fund-control.service';
import { CreateFundControlDto, UpdateFundControlDto } from './fund-control.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/fund-control')
export class FundControlController {
  constructor(private readonly fundControlService: FundControlService) {}

  @Get()
  @ApiOperation({ summary: 'Check fund availability for an appropriation' })
  @ApiQuery({ name: 'appropriationId', required: true })
  @ApiQuery({ name: 'amount', required: false })
  async checkFunds(
    @Query('appropriationId') appropriationId: string,
    @Query('amount') amount?: string,
  ) {
    const parsedAmount = amount ? parseFloat(amount) : undefined;
    return this.fundControlService.checkFundAvailability(appropriationId, parsedAmount);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single fund control record by ID' })
  async findOne(@Param('id') id: string) {
    return this.fundControlService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'fund_control_officer')
  @ApiOperation({ summary: 'Create a new fund control record' })
  async create(@Body() dto: CreateFundControlDto) {
    return this.fundControlService.create(dto);
  }

  @Put(':id')
  @Roles('admin', 'comptroller', 'fund_control_officer')
  @ApiOperation({ summary: 'Update a fund control record' })
  async update(@Param('id') id: string, @Body() dto: UpdateFundControlDto) {
    return this.fundControlService.update(id, dto);
  }
}
