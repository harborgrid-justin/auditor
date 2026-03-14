import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../database/database.module';

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

/** In-memory refresh token store. Production should use Redis or DB. */
const refreshTokenStore = new Map<string, { userId: string; expiresAt: number }>();

@Injectable()
export class AuthService {
  private readonly refreshTokenTtlMs: number;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: unknown,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.refreshTokenTtlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
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
    const refreshToken = this.generateRefreshToken(user.id);

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
    const stored = refreshTokenStore.get(refreshToken);

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (Date.now() > stored.expiresAt) {
      refreshTokenStore.delete(refreshToken);
      throw new UnauthorizedException('Refresh token expired');
    }

    // Revoke old refresh token (rotation)
    refreshTokenStore.delete(refreshToken);

    // Look up user
    const { users } = await import('@shared/lib/db/pg-schema');
    const typedDb = this.db as import('drizzle-orm/node-postgres').NodePgDatabase;
    const results = await typedDb.select().from(users).where(eq(users.id, stored.userId));
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

  private generateRefreshToken(userId: string): string {
    const token = crypto.randomBytes(48).toString('hex');
    refreshTokenStore.set(token, {
      userId,
      expiresAt: Date.now() + this.refreshTokenTtlMs,
    });
    return token;
  }
}
