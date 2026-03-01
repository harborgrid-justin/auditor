import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { FinancialStatementsService } from './financial-statements.service';
import {
  GenerateStatementDto,
  GenerateNoteDisclosuresDto,
  GenerateFullPackageDto,
} from './financial-statements.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/financial-statements')
export class FinancialStatementsController {
  constructor(private readonly financialStatementsService: FinancialStatementsService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a specific federal financial statement' })
  async generateStatement(@Body() dto: GenerateStatementDto) {
    return this.financialStatementsService.generateStatement(dto);
  }

  @Post('note-disclosures')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate note disclosures per OMB A-136' })
  async generateNoteDisclosures(@Body() dto: GenerateNoteDisclosuresDto) {
    return this.financialStatementsService.generateNoteDisclosures(dto);
  }

  @Post('full-package')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'auditor')
  @ApiOperation({ summary: 'Generate complete financial statement package' })
  async generateFullPackage(@Body() dto: GenerateFullPackageDto) {
    return this.financialStatementsService.generateFullPackage(dto);
  }
}
