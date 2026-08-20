# DropZen Employee Portal

Internal operations platform for attendance, Excel task workflows, leave, payroll, documents, and admin controls.

The UI is the existing Next.js app at the repository root. Core business logic, authentication, files, and PostgreSQL live in **`/backend`** (Express + Prisma). There is no Firebase, Supabase, Clerk, Auth0, or other backend-as-a-service.

Employee signup is not public. An admin creates every account.

## Architecture

```
Next.js 16 (this repo root)     Express API (/backend)        PostgreSQL
src/app  UI + route shells  →   REST /api/*  cookies          Prisma schema + migrations
src/server/actions          →   controllers/services          File metadata
src/lib/backend.ts          →   session + RBAC                uploads/ on disk
next.config.ts rewrites /api/* to BACKEND_URL
```

- **Frontend:** Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui. Kept at the repo root so existing Next tooling stays intact (`src/`, `next.config.ts`). Treat this directory as the frontend app; the API is isolated under `/backend`.
- **Backend:** Node.js + TypeScript + Express 5 in `/backend`. Routes stay thin; services own business rules.
- **Database:** PostgreSQL via Prisma 6. UUID primary keys, migrations in `backend/prisma/migrations`.
- **Auth:** Email/username + password, bcrypt hashes, opaque session tokens stored hashed in `Session`, httpOnly `dropzen_session` cookie (SameSite=Lax). Server-side RBAC on every protected route (`ADMIN` / `EMPLOYEE`).
- **Files:** Stored under `backend/uploads` (not a public web folder). PostgreSQL keeps metadata and generated names. Downloads go through authenticated endpoints.

Frontend route guards (`src/proxy.ts` + `requireAdmin` / `requireEmployee`) are UX only. Authorization is enforced in the API.

## How to run locally

Requirements: Node.js 20+ and PostgreSQL 16 (Docker, a hosted instance, or the embedded helper).

```bash
npm install
npm --prefix backend install
copy .env.example .env
copy backend\.env.example backend\.env
```

On macOS/Linux use `cp`. Generate secrets and put them in `backend/.env`:

```bash
node -e "const c=require('crypto'); console.log('SESSION_SECRET='+c.randomBytes(32).toString('base64url')); console.log('JWT_SECRET='+c.randomBytes(32).toString('base64url')); console.log('ENCRYPTION_KEY='+c.randomBytes(32).toString('hex'));"
```

`ENCRYPTION_KEY` must be 64 hex characters. Never commit `.env` files.

### PostgreSQL

**Option A — Docker**

```bash
docker compose up -d postgres
```

**Option B — no Docker (Windows-friendly embedded Postgres)**

```bash
npm run dev:db
```

This binds `127.0.0.1:5432` with user/password/db `dropzen`. Data directory: `backend/data/postgres`.

Then:

```bash
cd backend
npx prisma migrate deploy
npx tsx prisma/seed.ts
cd ..
npm run dev:api
npm run dev:web
```

Or from the repo root after the database is up:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). API health: [http://127.0.0.1:4000/api/health](http://127.0.0.1:4000/api/health).

Set `BACKEND_URL=http://127.0.0.1:4000` in the root `.env` (IPv4 avoids Windows `localhost` → IPv6 fetch failures).

## Bootstrap credentials

Seed creates **only** the administrator. No demo employees, salaries, attendance, tasks, or notifications are inserted.

| Role | Email | Username | Password |
| --- | --- | --- | --- |
| Admin | `admin@dropzen.com` | `admin` | `Admin@1234` |

Create employees from **Admin → Employees → Add employee**. New accounts start with verification status `NOT_STARTED` and cannot open the operations dashboard until an admin approves Employee Verification.

To remove leftover local demo users (Priya / Rahul / Ananya / qa.* / e2e.*) without dropping the schema:

```bash
npm --prefix backend run cleanup:demo
```

## Environment variables

Root `.env` (Next.js):

| Variable | Purpose |
| --- | --- |
| `BACKEND_URL` | Express origin used by server actions and `/api` rewrites. Default `http://127.0.0.1:4000`. |
| `APP_URL` | Public site origin (reset links). Default `http://localhost:3000`. |
| `DEMO_SHOW_RESET_LINK` | `true` locally so forgot-password can show a reset URL (no SMTP). Disable in production. |

Backend `.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Signs/derives session material. Long random string. |
| `JWT_SECRET` | Reserved secret (keep set; sessions are opaque cookies). |
| `ENCRYPTION_KEY` | 64 hex chars. AES-256-GCM for bank account numbers and PAN. |
| `FRONTEND_URL` | CORS origin. Default `http://localhost:3000`. |
| `PORT` | API port. Default `4000`. |
| `UPLOAD_DIR` | Private file directory. Default `./uploads`. |
| `NODE_ENV` | `development` or `production` |
| `COOKIE_NAME` | Default `dropzen_session` |
| `SESSION_TTL_HOURS` / `SESSION_ABSOLUTE_DAYS` | Sliding and absolute session lifetime |

## API surface (selected)

All JSON errors look like `{ "success": false, "message": "...", "code": "ERROR_CODE" }`.

| Area | Examples |
| --- | --- |
| Health | `GET /api/health` → `{ "status": "ok" }` |
| Auth | `POST /api/auth/login`, `logout`, `forgot-password`, `reset-password`, `change-password`, `GET /api/auth/me` |
| Admin employees | `GET/POST /api/admin/employees`, `GET/PATCH/DELETE /api/admin/employees/:id`, `PATCH .../status` |
| Employee verification | `GET/PATCH /api/employee/kyc`, `POST /api/employee/kyc/submit`, `POST /api/employee/kyc/documents`; admin `GET /api/admin/kyc`, `POST .../approve|reject|correction` |
| Employee | `GET /api/employee/dashboard` (requires approved verification), `GET/PATCH /api/employee/profile`, `GET /api/employee/salary`, `GET /api/employee/events` (SSE) |
| Attendance | `POST /api/attendance/check-in`, `check-out`, `GET today/history`, admin list/correct, correction requests |
| Tasks | Admin CRUD + assign; employee list/get; submit Excel with version history |
| Review | `POST /api/admin/submissions/:id/approve`, `.../revision` |
| Leave | `POST/GET /api/leave`, `GET /api/leave/balance`, admin approve/reject |
| Bank / payroll | Employee bank (masked); admin verify; salary records + payslip PDF |
| Documents | Authenticated `GET /api/documents/:id/download` and `GET /api/files/:id` |
| Notifications / announcements | List, mark read, `GET /api/notifications/unread-count`, admin publish |
| Audit | `GET /api/admin/audit` (admin only) |
| Exports | `GET /api/admin/reports/attendance.csv` (also payroll, tasks, employees) |

## Authentication and files

- Passwords: bcrypt (never stored plaintext).
- Sessions: random token, SHA-256 stored in PostgreSQL, revoked on logout; httpOnly cookie.
- Account lockout after repeated failed logins; login + API rate limits; Helmet headers; CORS locked to `FRONTEND_URL`.
- CSRF: cookie is SameSite=Lax and the browser talks to Next on the same origin (`/api` is rewritten server-side).
- Bank/PAN/government ID encrypted at rest. Employee and default admin responses mask account numbers and ID values. Encrypted payloads are not returned to the UI.
- Uploads: type/size checks, generated filenames, path-traversal rejection, store outside the Next.js public tree. Local disk is swappable later for S3 by replacing `backend/src/services/storage.ts`.

## Tests

```bash
npm test                 # backend vitest (auth, isolation, attendance, tasks, leave, documents)
npm run e2e              # full admin→employee workflow against a running API (+ UI if :3000 is up)
```

## Production / VPS

1. Provision PostgreSQL 16 and a Node 20+ host (or two processes: API + Next).
2. Set production env vars (no `DEMO_SHOW_RESET_LINK`). Use `NODE_ENV=production`, HTTPS, `FRONTEND_URL` = real origin.
3. Persist `UPLOAD_DIR` on a volume.
4. Commands:

```bash
# API
cd backend
npx prisma generate
npx prisma migrate deploy
npm run build
NODE_ENV=production node dist/index.js

# bootstrap admin only (no fake business records)
npx tsx prisma/seed.ts

# Web
cd ..
npx next build
npx next start
```

Health check the API at `/api/health`. Point the reverse proxy so the browser origin serves Next, and Next `BACKEND_URL` reaches Express on the private network.

SQLite under `/prisma` is leftover from an earlier local prototype and is **not** used. Canonical schema: `backend/prisma/schema.prisma`.
