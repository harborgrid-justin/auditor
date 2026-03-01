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
import { BudgetFormulationService } from './budget-formulation.service';
import { CreateBudgetFormulationDto, SubmitUnfundedRequirementDto } from './budget-formulation.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/budget-formulation')
export class BudgetFormulationController {
  constructor(private readonly budgetFormulationService: BudgetFormulationService) {}

  @Get()
  @ApiOperation({ summary: 'List budget formulations for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  @ApiQuery({ name: 'fiscalYear', required: false })
  async findAll(
    @Query('engagementId') engagementId: string,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    const formulations = await this.budgetFormulationService.findByEngagement(
      engagementId,
      fiscalYear ? parseInt(fiscalYear, 10) : undefined,
    );
    return { formulations };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single budget formulation by ID' })
  async findOne(@Param('id') id: string) {
    return this.budgetFormulationService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Create a new budget formulation entry' })
  async create(@Body() dto: CreateBudgetFormulationDto) {
    return this.budgetFormulationService.create(dto);
  }

  @Post('unfunded-requirements')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Submit an unfunded requirement' })
  async submitUnfundedRequirement(@Body() dto: SubmitUnfundedRequirementDto) {
    return this.budgetFormulationService.submitUnfundedRequirement(dto);
  }

  @Get('reports/ppbe-summary')
  @ApiOperation({ summary: 'Get PPBE summary for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  @ApiQuery({ name: 'fiscalYear', required: true })
  async getPPBESummary(
    @Query('engagementId') engagementId: string,
    @Query('fiscalYear') fiscalYear: string,
  ) {
    return this.budgetFormulationService.getPPBESummary(
      engagementId,
      parseInt(fiscalYear, 10),
    );
  }
}
