# AGENTS.md - Express API Server

> Cursor agents: see `.cursor/rules/code-quality.mdc` (always on) and `.cursor/rules/api-architecture.mdc` (API files).

## Developer Commands

```bash
npm run dev       # Development server (tsx watch)
npm run build    # TypeScript build
npm start        # Production (node dist/index.js)
npm run clean   # Remove dist + tsconfig.tsbuildinfo
npm run lint   # ESLint check
npm run lint:fix
npm run format
```

**Command order for changes**: `format` -> `lint` -> `typecheck` (build)

## Key Facts

- **Type**: ES Module (`"type": "module"` in package.json)
- **Entry**: `src/index.ts`
- **Express app factory**: `src/app.ts` exports `createApp()`
- **Database**: PostgreSQL via Drizzle (`src/db/`) — Better Auth uses `drizzleAdapter`

## Important Constraints

- `NODE_ENV=production` enables: trust proxy, security monitoring, JSON logging
- `NODE_ENV=development` enables: Swagger UI at `/api-docs`, pretty logging
- **Express 5.x** - `req.query` and `req.params` are read-only (do not reassign)
- **Zod 4.x** - validation schemas use `.parse()`, not `.parseAsync()`

## Package Quirks

- Uses `tsx` for dev (not ts-node): `"tsx watch src/index.ts"`
- Uses `rimraf` for cross-platform clean
- Drizzle + `postgres` (postgres.js) — `DATABASE_PREPARE_STATEMENTS` defaults to false.
  Enable only after verifying protocol preparation support (current Neon PgBouncer supports it).
  Drizzle's `unsafe()` calls need the adapter in `src/db/prepared-queries.ts` to opt in.
- DB scripts: `pnpm db:push` / `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` / `pnpm db:clear` / `pnpm db:clear:chats`

## Repository Structure

```
src/
├── config/          # env, middlewares
├── controllers/   # route handlers
├── core/errors/   # AppError, errorCodes (50+ codes)
├── core/responses/ # SuccessResponse
├── core/validation/schemas/ # Zod schemas
├── db/            # Drizzle client + schema
├── middlewares/    # validation, sanitize, security
├── routes/        # Express routes
├── services/     # business logic
└── utils/        # logger, graceful shutdown
```

## Response Structures

**Success**: `{ success: true, message, data, metadata: { timestamp, traceId } }`
**Error**: `{ success: false, message, error: { code, message, traceId, details? }, statusCode }`

Error codes in `src/core/errors/errorCodes.ts` - uses descriptive names like `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`.

## Testing Quick Check

```bash
curl http://localhost:5001/health
curl http://localhost:5001/api/data
curl -X POST http://localhost:5001/api/users -H "Content-Type: application/json" -d '{"email":"test@test.com"}'
```

## Gotchas

- In `src/middlewares/validation.ts`: do NOT reassign `req.query` or `req.params` (Express 5.x read-only)
- In `src/middlewares/sanitize.ts`: only sanitize `req.body`, not `req.query` (read-only)
- PORT defaults to 5001 (not 3000 or 5000)
