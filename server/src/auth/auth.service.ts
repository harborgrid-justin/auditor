import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../database/database.module';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: any,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    // Dynamic import to use shared schema
    const { users } = await import('@shared/lib/db/pg-schema');
    const results = await this.db.select().from(users).where(eq(users.email, email));
    const user = results[0];

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async login(user: { id: string; email: string; name: string; role: string }) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
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

    const existing = await this.db.select().from(users).where(eq(users.email, email));
    if (existing.length > 0) {
      throw new UnauthorizedException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    const now = new Date().toISOString();

    await this.db.insert(users).values({
      id,
      email,
      name,
      passwordHash,
      role: 'auditor',
      createdAt: now,
    });

    return this.login({ id, email, name, role: 'auditor' });
  }
}
