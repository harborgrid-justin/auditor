import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import { PaginationQueryDto, buildPaginatedResponse } from '../../common/dto/pagination.dto';
import { CreateTravelOrderDto, UpdateTravelOrderDto } from './travel.dto';

@Injectable()
export class TravelService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  async findByEngagement(engagementId: string, pagination?: PaginationQueryDto) {
    const { travelOrders } = await import('@shared/lib/db/pg-schema');
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(travelOrders)
        .where(eq(travelOrders.engagementId, engagementId))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(travelOrders)
        .where(eq(travelOrders.engagementId, engagementId)),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return buildPaginatedResponse(items, total, page, limit);
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
