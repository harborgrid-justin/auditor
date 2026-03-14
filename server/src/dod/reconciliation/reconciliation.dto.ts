import { IsString, IsNumber, IsOptional, IsEnum, IsArray, IsDateString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ---------------------------------------------------------------------------
// Nested line-item DTOs
// ---------------------------------------------------------------------------

export class PurchaseOrderLineItemDto {
  @ApiProperty({ description: 'Line number' })
  @IsNumber()
  lineNumber: number;

  @ApiProperty({ description: 'Item description' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Quantity ordered' })
  @IsNumber()
  quantity: number;

  @ApiProperty({ description: 'Unit price' })
  @IsNumber()
  unitPrice: number;

  @ApiProperty({ description: 'Total line amount' })
  @IsNumber()
  totalAmount: number;
}

export class ReceiptLineItemDto {
  @ApiProperty({ description: 'Corresponding PO line number' })
  @IsNumber()
  poLineNumber: number;

  @ApiProperty({ description: 'Quantity received' })
  @IsNumber()
  quantityReceived: number;

  @ApiProperty({ description: 'Quantity accepted after inspection' })
  @IsNumber()
  quantityAccepted: number;

  @ApiProperty({ description: 'Date accepted' })
  @IsString()
  acceptedDate: string;
}

export class InvoiceLineItemDto {
  @ApiProperty({ description: 'Corresponding PO line number' })
  @IsNumber()
  poLineNumber: number;

  @ApiProperty({ description: 'Quantity billed' })
  @IsNumber()
  quantityBilled: number;

  @ApiProperty({ description: 'Unit price billed' })
  @IsNumber()
  unitPrice: number;

  @ApiProperty({ description: 'Total line amount billed' })
  @IsNumber()
  totalAmount: number;
}

// ---------------------------------------------------------------------------
// Purchase Order
// ---------------------------------------------------------------------------

export class SubmitPurchaseOrderDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Purchase order number' })
  @IsString()
  poNumber: string;

  @ApiProperty({ description: 'Vendor identifier' })
  @IsString()
  vendorId: string;

  @ApiProperty({ description: 'Vendor name' })
  @IsString()
  vendorName: string;

  @ApiProperty({ description: 'Purchase order line items', type: [PurchaseOrderLineItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineItemDto)
  lineItems: PurchaseOrderLineItemDto[];

  @ApiProperty({ description: 'Total PO amount' })
  @IsNumber()
  totalAmount: number;

  @ApiProperty({ description: 'Appropriation ID funding this PO' })
  @IsString()
  appropriationId: string;

  @ApiProperty({ description: 'Obligation ID associated with this PO' })
  @IsString()
  obligationId: string;
}

// ---------------------------------------------------------------------------
// Receipt / Acceptance
// ---------------------------------------------------------------------------

export class SubmitReceiptDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Purchase order ID this receipt is for' })
  @IsString()
  poId: string;

  @ApiProperty({ description: 'Receipt line items', type: [ReceiptLineItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineItemDto)
  lineItems: ReceiptLineItemDto[];

  @ApiProperty({ description: 'Inspector / quality assurance representative' })
  @IsString()
  inspectedBy: string;
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

export class SubmitInvoiceDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Purchase order ID this invoice is for' })
  @IsString()
  poId: string;

  @ApiProperty({ description: 'Vendor invoice number' })
  @IsString()
  vendorInvoiceNumber: string;

  @ApiProperty({ description: 'Invoice line items', type: [InvoiceLineItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  lineItems: InvoiceLineItemDto[];

  @ApiProperty({ description: 'Total invoice amount' })
  @IsNumber()
  totalInvoiceAmount: number;

  @ApiProperty({ description: 'Invoice date (ISO 8601)' })
  @IsString()
  invoiceDate: string;

  @ApiProperty({ description: 'Payment due date (ISO 8601)' })
  @IsString()
  dueDate: string;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export class RunMatchingDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiPropertyOptional({ description: 'Specific PO ID to match (omit to match all)' })
  @IsOptional()
  @IsString()
  poId?: string;
}

// ---------------------------------------------------------------------------
// Suspense
// ---------------------------------------------------------------------------

export class CreateSuspenseItemDto {
  @ApiProperty({ description: 'Engagement ID' })
  @IsString()
  engagementId: string;

  @ApiProperty({ description: 'Suspense account number (e.g. F3875, F3880)' })
  @IsString()
  accountNumber: string;

  @ApiProperty({ description: 'Account title' })
  @IsString()
  accountTitle: string;

  @ApiProperty({ description: 'Dollar amount' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Source of the suspense transaction' })
  @IsString()
  source: string;

  @ApiProperty({ description: 'Description of the suspense item' })
  @IsString()
  description: string;
}

export class ClearSuspenseItemDto {
  @ApiProperty({ description: 'Suspense item ID to clear' })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Clearing action',
    enum: ['cleared', 'written_off', 'transferred'],
  })
  @IsEnum(['cleared', 'written_off', 'transferred'])
  clearingAction: 'cleared' | 'written_off' | 'transferred';

  @ApiProperty({ description: 'Comment explaining the clearing action' })
  @IsString()
  comment: string;
}
