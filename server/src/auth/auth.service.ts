import { Injectable, Inject, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../database/database.module';
import { createClient, RedisClientType } from 'redis';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
}

interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
}

const REFRESH_TOKEN_PREFIX = 'refresh_token:';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTokenTtlMs: number;
  private readonly refreshTokenTtlSeconds: number;
  private redis: RedisClientType | null = null;
  /** Fallback in-memory store when Redis is unavailable. */
  private readonly fallbackStore = new Map<string, { userId: string; expiresAt: number }>();

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: unknown,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.refreshTokenTtlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    this.refreshTokenTtlSeconds = 7 * 24 * 60 * 60;
    this.initRedis();
  }

  private async initRedis(): Promise<void> {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);

    try {
      this.redis = createClient({ url: `redis://${redisHost}:${redisPort}` });
      this.redis.on('error', (err: Error) => {
        this.logger.warn(`Redis connection error (falling back to memory): ${err.message}`);
      });
      await this.redis.connect();
      this.logger.log(`Refresh token store connected to Redis at ${redisHost}:${redisPort}`);
    } catch (err: unknown) {
      this.logger.warn(
        `Redis unavailable for refresh tokens (using in-memory fallback): ${err instanceof Error ? err.message : String(err)}`,
      );
      this.redis = null;
    }
  }

  async validateUser(email: string, password: string): Promise<UserRecord> {
    const { users } = await import('@shared/lib/db/pg-schema');
    const typedDb = this.db as import('drizzle-orm/node-postgres').NodePgDatabase;
    const results = await typedDb.select().from(users).where(eq(users.email, email));
    const user = results[0] as Record<string, unknown> | undefined;

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash as string);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: user.id as string,
      email: user.email as string,
      name: user.name as string,
      role: user.role as string,
    };
  }

  async login(user: UserRecord) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900, // 15 minutes in seconds
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async register(email: string, password: string, name: string) {
    const { users } = await import('@shared/lib/db/pg-schema');
    const { v4: uuidv4 } = await import('uuid');
    const typedDb = this.db as import('drizzle-orm/node-postgres').NodePgDatabase;

    const existing = await typedDb.select().from(users).where(eq(users.email, email));
    if (existing.length > 0) {
      throw new UnauthorizedException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    const now = new Date().toISOString();

    await typedDb.insert(users).values({
      id,
      email,
      name,
      passwordHash,
      role: 'auditor',
      createdAt: now,
    } as Record<string, unknown>);

    return this.login({ id, email, name, role: 'auditor' });
  }

  async refreshAccessToken(refreshToken: string) {
    const userId = await this.getRefreshToken(refreshToken);

    if (!userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Revoke old refresh token (rotation)
    await this.deleteRefreshToken(refreshToken);

    // Look up user
    const { users } = await import('@shared/lib/db/pg-schema');
    const typedDb = this.db as import('drizzle-orm/node-postgres').NodePgDatabase;
    const results = await typedDb.select().from(users).where(eq(users.id, userId));
    const user = results[0] as Record<string, unknown> | undefined;

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.login({
      id: user.id as string,
      email: user.email as string,
      name: user.name as string,
      role: user.role as string,
    });
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(48).toString('hex');
    await this.storeRefreshToken(token, userId);
    return token;
  }

  // ---------------------------------------------------------------------------
  // Redis-backed refresh token storage with in-memory fallback
  // ---------------------------------------------------------------------------

  private async storeRefreshToken(token: string, userId: string): Promise<void> {
    if (this.redis?.isReady) {
      await this.redis.setEx(
        `${REFRESH_TOKEN_PREFIX}${token}`,
        this.refreshTokenTtlSeconds,
        userId,
      );
    } else {
      this.fallbackStore.set(token, {
        userId,
        expiresAt: Date.now() + this.refreshTokenTtlMs,
      });
    }
  }

  private async getRefreshToken(token: string): Promise<string | null> {
    if (this.redis?.isReady) {
      return this.redis.get(`${REFRESH_TOKEN_PREFIX}${token}`);
    }

    const stored = this.fallbackStore.get(token);
    if (!stored) return null;
    if (Date.now() > stored.expiresAt) {
      this.fallbackStore.delete(token);
      return null;
    }
    return stored.userId;
  }

  private async deleteRefreshToken(token: string): Promise<void> {
    if (this.redis?.isReady) {
      await this.redis.del(`${REFRESH_TOKEN_PREFIX}${token}`);
    } else {
      this.fallbackStore.delete(token);
    }
  }
}
