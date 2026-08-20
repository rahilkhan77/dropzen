# DropZen production

DropZen is a custom Express + PostgreSQL + Prisma backend with a Next.js frontend. Do not introduce a BaaS or replace the database.

## Deployment

### Required software

- Node.js 20+
- PostgreSQL 15+ (`pg_dump` / `psql` on the PATH)
- A reverse proxy that terminates HTTPS (Caddy, nginx, or a load balancer)

### Environment variables

Copy `backend/.env.example`. Production **must** set:

- `DATABASE_URL`
- `SESSION_SECRET` (long random)
- `JWT_SECRET` (long random)
- `ENCRYPTION_KEY` (64 hex chars)
- `FRONTEND_URL` (exact browser origin)
- `SMTP_HOST`, `SMTP_FROM`
- `NODE_ENV=production`
- `UPLOAD_DIR` (writable private directory)

Optional SMTP: `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE=true` for implicit TLS (typically port 465).

The API process exits on startup if required production variables are missing.

Never commit real secrets. Rotate `SESSION_SECRET` / `ENCRYPTION_KEY` only with a planned session/data migration.

### Database setup

```bash
createdb dropzen
# or create role + database, then set DATABASE_URL
```

### Migration

Development:

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

Production:

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

Seed only creates company settings, leave types, and the bootstrap admin (`admin@dropzen.com`). Change that password immediately.

```bash
npm --prefix backend run seed
```

### Build

```bash
npm run build
```

This compiles the backend (`npm --prefix backend run build`) and the Next.js app.

### Start

Do not use `next dev` / `tsx watch` in production.

```bash
# API
NODE_ENV=production npm --prefix backend run start

# Web
NODE_ENV=production npm run start:web
```

Point the reverse proxy to the Next.js server and keep `BACKEND_URL` on the web host pointing at the API. The app already rewrites `/api/*` to the backend.

The API handles `SIGTERM` / `SIGINT`: it stops listening, disconnects Prisma, then exits.

---

## Security

- Assume HTTPS in production. Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production`.
- Restrict CORS to `FRONTEND_URL`.
- Helmet security headers are enabled. Rate limits apply globally; login is additionally throttled.
- Passwords are bcrypt-hashed. Invitation and reset tokens are stored as SHA-256 hashes only.
- File uploads are stored under `UPLOAD_DIR`, never as public frontend assets. Downloads go through `/api/files/:id` and `/api/documents/:id/download` with authorization.
- PAN / bank account / government ID are encrypted at rest. APIs return masked values.
- PostgreSQL must not be reachable from the public internet. Use a private network or localhost bind.
- Remove QA accounts before launch:

```bash
npm --prefix backend run cleanup:production-test-data
npm --prefix backend run cleanup:production-test-data -- --confirm
```

That command only deletes employees whose email local-part starts with `live.`, `browser.`, `qa.`, or `e2e.`. It never deletes admins, company settings, or leave types.

---

## Operations

### How to create an employee

Admin → Employees → Add employee. Required: name, email, phone, department, designation, joining date (employee ID optional). The account is created as `INVITED` with verification `NOT_STARTED`. No salary, attendance, tasks, documents, or leave balances are created.

### How the employee receives the invitation

The API emails `/invite/<token>`. Unused previous invitations are invalidated when you resend. The raw token is never stored. After the employee sets a password, they are sent to `/employee/kyc`.

### How to approve verification

Admin → Employee verification → open the record → Approve. This sets `kycStatus=APPROVED`, verifies bank details when present, and creates leave balances for the current year (idempotent).

Operational access requires **ACTIVE + APPROVED**. Frontend redirects are not a security boundary; the API enforces the gate.

### How to assign a task

Admin → Tasks → Create task. Fill title, description, instructions, date, deadline, priority, estimated hours, optional Excel template and reference files, and one or more employees. Check Recurring (daily/weekly/monthly) if the assignment should repeat. Employees are notified in-app and by email.

### How to review a task

Open the task, review the Excel submission, request revision or approve. Overdue is computed on the server from the deadline.

### How to process salary

Admin → Payroll → select employee and month → enter base, bonus, deductions, net (calculated), payment date/status/reference/notes → optionally attach a payslip. Mark `PAID` when the transfer is done. The employee only sees their own records and downloads the payslip through an authenticated endpoint.

---

## Backup

The application does not delete or rotate backups. Keep backups off-box.

### PostgreSQL backup

Daily (example):

```bash
pg_dump --format=custom --file="/var/backups/dropzen/dropzen-$(date +%F).dump" "$DATABASE_URL"
```

Also copy `UPLOAD_DIR`. Without the files, payslips and KYC documents cannot be restored from SQL alone.

### Restore

```bash
pg_restore --clean --if-exists --dbname="$DATABASE_URL" /var/backups/dropzen/dropzen-YYYY-MM-DD.dump
```

Then restore the upload directory to the same `UPLOAD_DIR` path.

### Backup verification

- Confirm the dump file size is non-zero and growing over time.
- Periodically restore into a **separate** database and run `SELECT count(*) FROM "User";` plus a sample file read.
- Retention guidance: keep daily dumps for 14 days, weekly for 8 weeks, monthly for 12 months. Do not auto-delete until you have verified a restore.

---

## Troubleshooting

### Startup

- `Invalid environment configuration` / `Missing required production environment variables`: fix `.env` and restart.
- `ENCRYPTION_KEY must be a 64-character hex string`.
- Database connection errors: check `DATABASE_URL`, PostgreSQL listen address, and firewall.

### Prisma generation

```bash
npm --prefix backend run generate
```

If the client is stale after a migration, generate again and restart the API.

### Upload directory permissions

The API process must be able to create files under `UPLOAD_DIR`. A missing or read-only directory causes document and payslip uploads to fail.

### SMTP

If `SMTP_HOST` is empty, invitation and reset emails are written to the API log (`email:dev`) and are not delivered. That is for local development only. Production requires a real SMTP server (not Gmail-specific). Check `SMTP_FROM`, credentials, port, and `SMTP_SECURE`.

### Sessions

Password change, password reset, suspend, and disable revoke existing sessions. If users bounce to login after those actions, that is expected.
