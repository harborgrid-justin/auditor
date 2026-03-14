import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DATABASE_TOKEN } from '../database/database.module';
import { AuthService } from './auth.service';

jest.mock('@shared/lib/db/pg-schema', () => ({
  users: {
    id: 'id',
    email: 'email',
    name: 'name',
    role: 'role',
    passwordHash: 'passwordHash',
    createdAt: 'createdAt',
  },
}), { virtual: true });

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid'),
}), { virtual: true });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bcrypt = require('bcryptjs');

describe('AuthService', () => {
  let service: AuthService;
  let mockDb: Record<string, jest.Mock>;
  let mockJwtService: Partial<JwtService>;

  beforeEach(async () => {
    const mockWhere = jest.fn().mockResolvedValue([]);
    const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = jest.fn().mockReturnValue({ from: mockFrom });
    const mockValues = jest.fn().mockResolvedValue(undefined);
    const mockInsert = jest.fn().mockReturnValue({ values: mockValues });
    const mockSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });

    mockDb = {
      select: mockSelect,
      from: mockFrom,
      where: mockWhere,
      insert: mockInsert,
      values: mockValues,
      update: mockUpdate,
      set: mockSet,
    };

    mockJwtService = {
      sign: jest.fn().mockReturnValue('signed-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'auditor',
      passwordHash: 'hashed-password',
    };

    it('should return user record for valid credentials', async () => {
      mockDb.where.mockResolvedValueOnce([mockUser]);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      const result = await service.validateUser('test@example.com', 'valid-password');

      expect(result).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'auditor',
      });
      expect(bcrypt.compare).toHaveBeenCalledWith('valid-password', 'hashed-password');
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      mockDb.where.mockResolvedValueOnce([mockUser]);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.validateUser('test@example.com', 'wrong-password'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.validateUser('nonexistent@example.com', 'password'))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'auditor',
    };

    it('should return access_token, refresh_token, and user data', async () => {
      const result = await service.login(mockUser);

      expect(result).toHaveProperty('access_token', 'signed-jwt-token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.refresh_token).toBeTruthy();
      expect(result).toHaveProperty('expires_in', 900);
      expect(result.user).toEqual(mockUser);
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'auditor',
      });
    });
  });

  describe('register', () => {
    it('should register a new user and return login result', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashed-new-password');

      const result = await service.register('new@example.com', 'password123', 'New User');

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.user).toEqual({
        id: 'test-uuid',
        email: 'new@example.com',
        name: 'New User',
        role: 'auditor',
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for duplicate email', async () => {
      mockDb.where.mockResolvedValueOnce([{ id: 'existing-user' }]);

      await expect(service.register('existing@example.com', 'password', 'Name'))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshAccessToken', () => {
    it('should return new tokens for valid refresh token', async () => {
      const loginResult = await service.login({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'auditor',
      });

      const refreshToken = loginResult.refresh_token;

      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'auditor',
      };
      mockDb.where.mockResolvedValueOnce([mockUser]);

      const result = await service.refreshAccessToken(refreshToken);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.user).toEqual(mockUser);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      await expect(service.refreshAccessToken('invalid-token'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for expired token', async () => {
      const loginResult = await service.login({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'auditor',
      });

      const refreshToken = loginResult.refresh_token;

      mockDb.where.mockResolvedValueOnce([{
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'auditor',
      }]);
      await service.refreshAccessToken(refreshToken);

      // Second use should fail since the old token was rotated out
      await expect(service.refreshAccessToken(refreshToken))
        .rejects.toThrow(UnauthorizedException);
    });
  });
});
