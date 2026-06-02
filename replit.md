# Breathe ESG — Emissions Ingestion & Review Platform

A full-stack emissions data ingestion and analyst review platform. Ingests SAP fuel/procurement data, utility electricity exports, and corporate travel records; normalizes them into auditable CO2e emission records; and surfaces a review dashboard where analysts can inspect, approve, flag, and reject records before audit lock.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/breathe-esg run dev` — run the React frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + multer (file uploads)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind + shadcn/ui + TanStack Query + wouter

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/` — Drizzle tables: ingestions, emission_records, audit_log
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/parsers/` — SAP, utility, and travel file parsers
- `artifacts/breathe-esg/src/` — React frontend
- `MODEL.md` — Data model documentation
- `DECISIONS.md` — Architecture decisions
- `TRADEOFFS.md` — Things not built
- `SOURCES.md` — Research notes on each data source

## Architecture decisions

- Multi-tenancy via `client_name` row filter (production would use tenant_id FK + RLS)
- Emission factors stored at ingestion time, not at query time — historical records are stable
- `activity_date` = midpoint of billing period for utility data (billing periods ≠ calendar months)
- Suspicious flags are advisory only — analysts always make final decisions
- Audit log rows are immutable (no updated_at)

## Product

Analysts upload SAP flat files, utility portal CSVs, and Concur-style travel CSVs. The system parses them, computes CO2e using traceable emission factors, and surfaces a review dashboard. Analysts can approve, flag (for investigation), or reject records. A full audit trail tracks every decision.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run codegen after changing `lib/api-spec/openapi.yaml`
- DB push required after changing `lib/db/src/schema/` files
- The API server auto-rebuilds on restart (esbuild bundled)
- File uploads use multer memory storage (max 20MB)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
