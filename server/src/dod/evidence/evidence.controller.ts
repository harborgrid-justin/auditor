import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { EvidenceService } from './evidence.service';
import { GenerateEvidencePackageDto } from './evidence.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'auditor')
  @ApiOperation({ summary: 'Generate an audit evidence package' })
  async generatePackage(
    @Body() dto: GenerateEvidencePackageDto,
    @Request() req: any,
  ) {
    return this.evidenceService.generatePackage(dto, req.user?.id || 'system');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a generated evidence package' })
  async getPackage(@Param('id') id: string) {
    return this.evidenceService.getPackage(id);
  }

  @Get()
  @ApiOperation({ summary: 'List evidence packages for an engagement' })
  @ApiQuery({ name: 'engagementId', required: true })
  async listPackages(@Query('engagementId') engagementId: string) {
    return this.evidenceService.listPackages(engagementId);
  }
}
