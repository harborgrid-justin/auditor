import { Module } from '@nestjs/common';
import { AppropriationsController } from './appropriations/appropriations.controller';
import { AppropriationsService } from './appropriations/appropriations.service';
import { ObligationsController } from './obligations/obligations.controller';
import { ObligationsService } from './obligations/obligations.service';
import { AdaController } from './ada/ada.controller';
import { AdaService } from './ada/ada.service';
import { FundControlController } from './fund-control/fund-control.controller';
import { FundControlService } from './fund-control/fund-control.service';
import { DisbursementsController } from './disbursements/disbursements.controller';
import { DisbursementsService } from './disbursements/disbursements.service';
import { MilitaryPayController } from './military-pay/military-pay.controller';
import { MilitaryPayService } from './military-pay/military-pay.service';
import { CivilianPayController } from './civilian-pay/civilian-pay.controller';
import { CivilianPayService } from './civilian-pay/civilian-pay.service';
import { TravelController } from './travel/travel.controller';
import { TravelService } from './travel/travel.service';
import { ContractsController } from './contracts/contracts.controller';
import { ContractsService } from './contracts/contracts.service';
import { UssglController } from './ussgl/ussgl.controller';
import { UssglService } from './ussgl/ussgl.service';
import { DodReportsController } from './reports/dod-reports.controller';
import { DodReportsService } from './reports/dod-reports.service';

// New modules — Phase 7
import { SecurityCooperationController } from './security-cooperation/security-cooperation.controller';
import { SecurityCooperationService } from './security-cooperation/security-cooperation.service';
import { BudgetFormulationController } from './budget-formulation/budget-formulation.controller';
import { BudgetFormulationService } from './budget-formulation/budget-formulation.service';
import { DebtManagementController } from './debt-management/debt-management.controller';
import { DebtManagementService } from './debt-management/debt-management.service';
import { LeasesController } from './leases/leases.controller';
import { LeasesService } from './leases/leases.service';
import { PayTablesController } from './pay-tables/pay-tables.controller';
import { PayTablesService } from './pay-tables/pay-tables.service';
import { FinancialStatementsController } from './financial-statements/financial-statements.controller';
import { FinancialStatementsService } from './financial-statements/financial-statements.service';
import { IGTReconciliationController } from './igt-reconciliation/igt-reconciliation.controller';
import { IGTReconciliationService } from './igt-reconciliation/igt-reconciliation.service';

@Module({
  controllers: [
    AppropriationsController,
    ObligationsController,
    AdaController,
    FundControlController,
    DisbursementsController,
    MilitaryPayController,
    CivilianPayController,
    TravelController,
    ContractsController,
    UssglController,
    DodReportsController,
    // New controllers
    SecurityCooperationController,
    BudgetFormulationController,
    DebtManagementController,
    LeasesController,
    PayTablesController,
    FinancialStatementsController,
    IGTReconciliationController,
  ],
  providers: [
    AppropriationsService,
    ObligationsService,
    AdaService,
    FundControlService,
    DisbursementsService,
    MilitaryPayService,
    CivilianPayService,
    TravelService,
    ContractsService,
    UssglService,
    DodReportsService,
    // New services
    SecurityCooperationService,
    BudgetFormulationService,
    DebtManagementService,
    LeasesService,
    PayTablesService,
    FinancialStatementsService,
    IGTReconciliationService,
  ],
  exports: [
    AppropriationsService,
    ObligationsService,
    AdaService,
    FundControlService,
    SecurityCooperationService,
    DebtManagementService,
    LeasesService,
    IGTReconciliationService,
  ],
})
export class DodModule {}
