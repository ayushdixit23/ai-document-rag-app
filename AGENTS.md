# AGENTS.md — Next.js + Express Starter

**Monorepo (Turborepo + pnpm workspaces):** `apps/*` and `packages/*`.

## Essential Commands (run from root)

| Command                            | What it does                                           |
| ---------------------------------- | ------------------------------------------------------ |
| `pnpm dev`                         | Start all apps (web + api)                             |
| `pnpm build`                       | Production build everything                            |
| `pnpm lint`                        | ESLint (flat config, strict TypeScript rules)          |
| `pnpm format`                      | `prettier --write` across all packages (mutates files) |
| `pnpm format:check`                | `prettier --check` across all packages (read-only)     |
| `pnpm check-types`                 | `tsc --noEmit` across all packages                     |
| `pnpm validate`                    | lint → format:check → check-types (read-only gate)     |
| `pnpm exec turbo dev --filter=web` | Web only                                               |
| `pnpm exec turbo dev --filter=api` | API only                                               |

### Formatting (`format` vs `format:check`)

Per-package scripts in `apps/web`, `apps/api`, and `packages/ui`:

| Script         | Command              | Mutates files? |
| -------------- | -------------------- | -------------- |
| `format`       | `prettier --write .` | Yes            |
| `format:check` | `prettier --check .` | No             |

- **`pnpm format`** — run manually to fix formatting repo-wide (before a PR, after a merge, or when `validate` fails on format).
- **`pnpm format:check`** — verify only; used by `validate` and safe for CI. Never use `format` inside hooks or gates.

**Pre-commit** (`lint-staged` → `validate`): formats staged files, then runs the read-only gate (lint + format:check + check-types). **Pre-push** runs `pnpm build`.

## Architecture

```
apps/web/       Next.js 16 (App Router, React 19, Tailwind CSS v4)
apps/api/       Express 5 + Drizzle (PostgreSQL) + Zod 4 — entry: src/index.ts
packages/
  ui/             @repo/ui — shared shadcn/ui components, hooks, theme CSS
  eslint-config/  @repo/eslint-config — base, node, next presets
  prettier-config/ @repo/prettier-config — semi, singleQuote, trailingComma:all, printWidth:100
  typescript-config/ @repo/typescript-config — base, nextjs, nodejs presets
```

- **All ESM** (`"type": "module"`) — imports use `.js` extensions (NodeNext convention).
- **API port**: 5001 (not 3000 or 5000). **Web port**: 3000.
- API docs (dev only): `http://localhost:5001/api-docs`

## Setup

1. `pnpm install` (auto-runs `husky` via `prepare` script to install git hooks)
2. `cp apps/api/env.example apps/api/.env`
3. Set `DATABASE_URL` in `.env` to a PostgreSQL connection string (e.g. Neon pooler URL).
4. From `apps/api`: `pnpm db:push` to apply the Drizzle schema.
5. `pnpm dev`

## Key Conventions

### API (see `apps/api/AGENTS.md` for full detail)

- **Express 5.x** — `req.query` and `req.params` are **read-only** (do not reassign).
- **Zod 4.x** — use `.parse()`, not `.parseAsync()` (different from Zod 3).
- `tsx` for dev (not ts-node): `tsx watch src/index.ts`.
- `pnpm clean` removes `dist` + `tsconfig.tsbuildinfo`.
- `NODE_ENV=production`: trust proxy, security monitoring, JSON logging.
- `NODE_ENV=development`: Swagger UI at `/api-docs`, pretty logging (pino-pretty).
- Error codes in `src/core/errors/errorCodes.ts` (~50 codes like `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`).

### Web

- **shadcn/ui (monorepo)** — shared primitives in `packages/ui` (`@repo/ui`); app blocks/forms in `apps/web/components/`. Both workspaces have `components.json` (must keep `style`, `baseColor`, `iconLibrary` in sync).
- **Add components** — from repo root: `pnpm dlx shadcn@latest add <name> -c apps/web` (CLI installs UI primitives to `packages/ui`, blocks to `apps/web`).
- **Imports** — `import { Button } from '@repo/ui/components/button'`; `cn` from `@repo/ui/lib/utils`.
- **`@repo/ui` exports** — shadcn CLI installs primitives as `packages/ui/src/components/<name>.tsx` (flat). Nested paths work via `./components/*/*` (e.g. `@repo/ui/components/ui/button`). Do not add deeper nesting without extending `package.json` `exports`.
- **Theme CSS** — shadcn tokens in `packages/ui/src/styles/globals.css`; `apps/web/app/globals.css` imports `@repo/ui/globals.css` and adds app-specific `@theme` / `@source`.
- **Dark mode** — class-based via `next-themes` (`ThemeProvider` in `apps/web/components/theme-provider.tsx`).
- **Tailwind CSS v4** — PostCSS via `@tailwindcss/postcss` in `postcss.config.mjs`; `next.config.js` sets `transpilePackages: ['@repo/ui']`.
- **Design system** — `apps/web/DESIGN.md` is the required visual source of truth for all web UI (Notion warm-workspace). Agents must read it before any page/component/CSS work. See `apps/web/AGENTS.md` and `.cursor/rules/design-system.mdc`.
- **Agent workflow** — `.cursor/rules/web-development.mdc`: read `apps/web/DESIGN.md` first, then React, Next.js, frontend-design, web-design-guidelines, tailwind-4-docs, and turborepo skills before writing web code.
- `pnpm check-types` runs `next typegen && tsc --noEmit` — typegen runs first to generate `.next/types/**/*.ts`.

### Code style

- ESLint 9 flat config with `typescript-eslint/strict` + `strictTypeChecked` + `projectService: true`.
- `simple-import-sort` enforced (both imports and exports).
- Complexity limits: max 250 lines/file, 60 lines/function, complexity 15, max-depth 4, max-params 5.
- Prettier: `semi: true`, `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`, `tabWidth: 2`.
- TypeScript strict mode with `noUncheckedIndexedAccess: true`.
- Unused variables allowed only with `_` prefix (Node config — API only).
- `.cursor/rules/` — agents should follow: `code-quality` (always on), `api-architecture` (API), `web-development` + `web-structure` + `design-system` (web/React/Next.js). Web app detail: `apps/web/AGENTS.md` + `apps/web/DESIGN.md`.

## Gotchas

- **No test framework** — no Jest, Vitest, Playwright. Add one before writing tests.
- **No CI** — no GitHub Actions workflows exist.
- `packages/eslint-config/README.md` still mentions `@turbo/eslint-config` (outdated) instead of `@repo/eslint-config`.
- `pnpm validate` is the **pre-merge gate** — lint, `format:check` (not `format`), and type checking. It must not write files; `lint-staged` handles staged formatting before validate runs.
- `turbo.json`: `build` depends on `^build`, `lint` on `^lint`, `check-types` on `^check-types` — upstream packages build/check first. See `.agents/skills/turborepo/SKILL.md` (also listed in `web-development.mdc`).
- `lint` caches to `node_modules/.cache/eslint/` — package scripts pass `--cache`; Turbo restores cache via `outputs` in `turbo.json`.
- **Generated files** (do not edit): `next-env.d.ts`, `.next/types/**/*.ts`, `apps/api/dist/`, `apps/web/.next/`.
- `.npmrc` sets `engine-strict=true` and hoists ESLint/Prettier (`public-hoist-pattern`) for monorepo tooling.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (7 days) so newly published npm versions cannot be installed until they age — requires pnpm ≥ 10.16 (`packageManager` is `pnpm@10.34.5`).
