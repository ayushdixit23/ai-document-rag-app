# Express API Server

Production-ready Express.js API with TypeScript, Drizzle/PostgreSQL, and comprehensive security.

Document upload, chat, streaming answers and summary setup: [RAG backend](./RAG_BACKEND.md).

## Quick Start

```bash
npm install
cp env.example .env
npm run dev
```

Server runs on `http://localhost:5001`

## Tech Stack

| Technology | Version | Purpose              |
| ---------- | ------- | -------------------- |
| Node.js    | 18+     | Runtime (ES Modules) |
| Express    | 5.x     | Web framework        |
| TypeScript | 6.x     | Strict typing        |
| PostgreSQL | 15+     | Database (e.g. Neon) |
| Drizzle    | 0.45.x  | ORM                  |
| Zod        | 4.x     | Validation           |
| Pino       | 10.x    | Logging              |

## Features

- **Security**: Helmet (CSP, HSTS), Input Sanitization, Security Monitoring
- **Rate Limiting**: 400 requests/15min (configurable)
- **Request Timeout**: 60 seconds
- **Database Pooling**: Configurable via `DATABASE_POOL_MAX` (postgres.js)
- **Error Handling**: RFC 7807 Problem Details format
- **Logging**: Pino (pretty in dev, JSON in prod)
- **Trace IDs**: Request tracing across logs
- **Swagger**: API docs in development

## Project Structure

```
src/
├── config/           # env, middlewares config
├── controllers/     # Route handlers (MVC)
├── core/errors/     # AppError, errorCodes
├── core/responses/ # SuccessResponse
├── core/validation/schemas/  # Zod schemas
├── db/             # Drizzle client + schema
├── middlewares/    # Security, validation, logging
├── routes/         # Express routes
├── services/       # Business logic
└── utils/         # Logger, graceful shutdown
```

## API Endpoints

| Endpoint        | Method | Description             |
| --------------- | ------ | ----------------------- |
| `/`             | GET    | Server info             |
| `/health`       | GET    | Health + system metrics |
| `/health/live`  | GET    | Liveness probe          |
| `/health/ready` | GET    | Readiness probe         |
| `/api/auth/*`   | ALL    | Better Auth endpoints   |
| `/api/me`       | GET    | Current session (auth)  |

## Response Formats

**Success:**

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { "id": 1, "name": "John" },
  "metadata": { "timestamp": "...", "traceId": "abc-123" }
}
```

**Error:**

```json
{
  "success": false,
  "message": "Validation failed",
  "error": { "code": "VALIDATION_FAILED", "message": "...", "traceId": "abc-123", "details": [...] },
  "statusCode": 400
}
```

## Environment Variables

| Variable                  | Default                       | Description          |
| ------------------------- | ----------------------------- | -------------------- |
| `PORT`                    | 5001                          | Server port          |
| `NODE_ENV`                | development                   | Environment          |
| `DATABASE_URL`            | (required)                    | PostgreSQL URL       |
| `DATABASE_POOL_MAX`       | 10                            | Max pool connections |
| `ALLOWED_ORIGINS`         | localhost:3000,localhost:3001 | CORS origins         |
| `RATE_LIMIT_MAX_REQUESTS` | 400                           | Max requests/15min   |

## Scripts

```bash
pnpm dev          # Development (hot reload)
pnpm build        # TypeScript build
pnpm start        # Production server
pnpm lint         # ESLint check
pnpm format       # Prettier format
pnpm db:push      # Push Drizzle schema to Postgres
pnpm db:generate  # Generate SQL migrations
pnpm db:migrate   # Run migrations
pnpm db:studio    # Drizzle Studio
```

## RAG foundation setup

Add `DATABASE_URL_DIRECT` (Neon direct, without `-pooler`) and the R2 values from
`env.example` to `apps/api/.env`. The API uses the pooled `DATABASE_URL` for normal
queries and the direct URL for pg-boss. Gemini model names have defaults, but
`GEMINI_API_KEY` is required.

The `0003` migration enables pgvector and adds document chunks, citations, and
processing state. Apply it from `apps/api` with `pnpm db:migrate` on a new database.

## Testing

```bash
# Health
curl http://localhost:5001/health

# Create user
curl -X POST http://localhost:5001/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}'

# Paginated posts
curl "http://localhost:5001/api/posts?page=1&limit=5"
```

## Swagger

Visit `http://localhost:5001/api-docs` in development

## Security Headers

- `Strict-Transport-Security` (HSTS) - 1 year
- `Content-Security-Policy` (CSP)
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Resource-Policy`
- `Referrer-Policy`

## Production

Set `NODE_ENV=production` to enable:

- Trust proxy
- Security monitoring
- JSON logging
