---
paths:
  - "server/src/**"
---

# NestJS Backend Rules

- Follow the established module pattern: `<name>.controller.ts` + `<name>.service.ts` + `<name>.dto.ts`
- Use `class-validator` decorators on DTOs (not Zod -- Zod is frontend only)
- Apply `@ApiTags`, `@ApiOperation`, `@ApiBearerAuth` Swagger decorators on all controllers
- Use `@Roles()` decorator for role-based access control
- Use Winston logger (injected via `server/src/common/logger/`) -- never use `console.log`
- Database access goes through Drizzle ORM only -- no raw SQL unless absolutely necessary
- Backend uses CommonJS modules (`"module": "commonjs"` in tsconfig)
- Run tests: `cd server && npm test`
- Run e2e: `cd server && npm run test:e2e`
