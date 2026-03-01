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
import { Roles } from '../common/decorators/roles.decorator';
import { JobsService, JobType } from './jobs.service';
import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class EnqueueJobDto {
  @ApiProperty()
  @IsString()
  type!: JobType;

  @ApiProperty()
  @IsString()
  engagementId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  fiscalYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;
}

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('api/jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'List recent job executions' })
  @ApiQuery({ name: 'engagementId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listJobs(
    @Query('engagementId') engagementId?: string,
    @Query('limit') limit?: string
  ) {
    const jobs = await this.jobsService.listRecentJobs(
      engagementId,
      limit ? parseInt(limit, 10) : 20
    );
    return { jobs };
  }

  @Get('schedules')
  @ApiOperation({ summary: 'List active scheduled jobs' })
  async getSchedules() {
    const schedules = await this.jobsService.getScheduledJobs();
    return { schedules };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job status by ID' })
  async getJobStatus(@Param('id') id: string) {
    const job = this.jobsService.getJobStatus(id);
    return job ?? { error: 'Job not found in active tracker' };
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles('admin', 'auditor', 'comptroller')
  @ApiOperation({ summary: 'Enqueue a new job' })
  async enqueueJob(@Body() dto: EnqueueJobDto, @Query('userId') userId?: string) {
    const job = await this.jobsService.enqueue({
      type: dto.type,
      engagementId: dto.engagementId,
      fiscalYear: dto.fiscalYear,
      parameters: dto.parameters,
      userId: userId ?? 'system',
    });
    return job;
  }
}
