import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import { CreateTravelOrderDto, UpdateTravelOrderDto } from './travel.dto';

@Injectable()
export class TravelService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async findByEngagement(engagementId: string) {
    const { travelOrders } = await import('@shared/lib/db/pg-schema');
    return this.db
      .select()
      .from(travelOrders)
      .where(eq(travelOrders.engagementId, engagementId));
  }

  async findOne(id: string) {
    const { travelOrders } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(travelOrders)
      .where(eq(travelOrders.id, id));

    if (results.length === 0) {
      throw new NotFoundException(`Travel order ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateTravelOrderDto) {
    const { travelOrders } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(travelOrders).values({
      id,
      engagementId: dto.engagementId,
      travelerId: dto.travelerId,
      orderType: dto.orderType,
      purpose: dto.purpose,
      originLocation: dto.originLocation,
      destinationLocation: dto.destinationLocation,
      departDate: dto.departDate,
      returnDate: dto.returnDate,
      authorizedAmount: dto.authorizedAmount,
      actualAmount: dto.actualAmount || 0,
      perDiemRate: dto.perDiemRate,
      lodgingRate: dto.lodgingRate,
      mieRate: dto.mieRate || 0,
      status: dto.status || 'authorized',
      authorizingOfficial: dto.authorizingOfficial,
      fiscalYear: dto.fiscalYear || new Date().getFullYear(),
      createdAt: now,
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateTravelOrderDto) {
    const { travelOrders } = await import('@shared/lib/db/pg-schema');

    // Verify exists
    await this.findOne(id);

    const updateData: Record<string, unknown> = {};
    if (dto.actualAmount !== undefined) updateData.actualAmount = dto.actualAmount;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.returnDate !== undefined) updateData.returnDate = dto.returnDate;
    if (dto.authorizedAmount !== undefined) updateData.authorizedAmount = dto.authorizedAmount;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(travelOrders)
        .set(updateData)
        .where(eq(travelOrders.id, id));
    }

    return this.findOne(id);
  }
}
