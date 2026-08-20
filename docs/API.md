# DropZen API

Base URL: `{BACKEND}` (local default `http://127.0.0.1:4000`).

Successful responses:

```json
{ "success": true, "message": "optional", "data": {} }
```

Error responses:

```json
{ "success": false, "message": "human-readable", "code": "ERROR_CODE", "requestId": "optional" }
```

Authentication uses the HTTP-only cookie `dropzen_session`. Do not store session tokens in `localStorage`.

Operational employee endpoints require `account status = ACTIVE` **and** `kycStatus = APPROVED`. Otherwise they return `403` with `KYC_REQUIRED` or a forbidden account status.

Admin list endpoints accept `page` (default 1), `limit` (default 25, max 100), plus `search`/`q` and filters noted below.

---

## Authentication

| Method | URL | Auth | Request | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | Public (rate limited) | `identifier`, `password` | `{ user, redirectTo }` + session cookie | `401` invalid, `423` locked, `403` invited/suspended/disabled |
| POST | `/api/auth/logout` | Cookie optional | — | clears cookie | — |
| GET | `/api/auth/me` | Session | — | current user (no hashes) | `401` |
| POST | `/api/auth/change-password` | Session | `currentPassword`, `newPassword`, `confirmPassword` | invalidates sessions | `400` |
| POST | `/api/auth/forgot-password` | Public (rate limited) | `identifier` | always generic success; `resetUrl` only in non-production | `429` |
| POST | `/api/auth/reset-password` | Public | `token`, `password`, `confirmPassword` | invalidates token + sessions | `400` expired |
| GET | `/api/auth/invite/:token` | Public | — | `{ valid, companyName, fullName?, email? }` | — |
| POST | `/api/auth/activate` | Public | `token`, `password`, `confirmPassword` | session cookie, `redirectTo: /employee/kyc` | `400` invalid invite |

---

## Employee

| Method | URL | Auth | Request | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/admin/employees` | Admin | `q`, `page`, `limit` | `{ items, total, page, limit }` | `403` |
| GET | `/api/admin/employees/options` | Admin | — | `{ items: [{ id, fullName, employeeCode }] }` | `403` |
| GET | `/api/admin/employees/:id` | Admin | — | profile (sensitive values masked) | `404` |
| POST | `/api/admin/employees` | Admin | `fullName`, `email`, `phone`, `department`, `designation`, `joiningDate`, optional `employeeCode` | `{ id, code, email, inviteUrl? }` — no password | `409` |
| PATCH | `/api/admin/employees/:id` | Admin | profile fields | — | `404` |
| PATCH | `/api/admin/employees/:id/status` | Admin | `status=ACTIVE\|SUSPENDED\|DISABLED` | revokes sessions when suspended/disabled | `400` |
| POST | `/api/admin/employees/:id/resend-invitation` | Admin | — | new invite; previous unused tokens invalidated | `409` if already active |
| POST | `/api/admin/employees/:id/reset-password` | Admin | — | emails reset link (never returns a password) | `404` |
| DELETE | `/api/admin/employees/:id` | Admin | — | **soft-disable** (records kept) | `404` |
| GET/PATCH | `/api/employee/profile` | Employee | profile + optional `photo` | own profile | `403` |

---

## Verification

Statuses: `NOT_STARTED`, `INCOMPLETE`, `PENDING_VERIFICATION`, `APPROVED`, `REJECTED` (separate from account `INVITED` / `ACTIVE` / `SUSPENDED` / `DISABLED`).

| Method | URL | Auth | Request | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| GET/PATCH | `/api/employee/kyc` | Employee | personal / identity / bank fields | progress, masked IDs | `403` if locked |
| POST | `/api/employee/kyc/submit` | Employee | — | `PENDING_VERIFICATION` | `400` incomplete |
| POST | `/api/employee/kyc/documents` | Employee | `category`, `file` | — | `400` |
| GET | `/api/admin/kyc` | Admin | `q`, `status`, `page`, `limit` | paged list | `403` |
| GET | `/api/admin/kyc/:employeeId` | Admin | `reveal=1` for full IDs | review payload | `404` |
| POST | `/api/admin/kyc/:id/approve` | Admin | — | unlocks workspace; initializes leave balances | `404` |
| POST | `/api/admin/kyc/:id/reject` | Admin | `reason` | — | `400` |
| POST | `/api/admin/kyc/:id/correction` | Admin | `reason` | back to `INCOMPLETE` | `400` |

---

## Tasks

| Method | URL | Auth | Request | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/admin/tasks` | Admin | title, description, instructions, dateKey, deadline, priority, estimatedHours, template, references, `employeeIds[]`, optional `recurring` + `frequency` | `{ id }` | `400` |
| GET | `/api/admin/tasks` | Admin | `q`, `employeeId`, `page`, `limit` | paged tasks | `403` |
| GET/PATCH/DELETE | `/api/admin/tasks/:id` | Admin | — | task / update / delete | `404` |
| GET | `/api/employee/tasks` | Approved employee | — | own assignments | `403 KYC_REQUIRED` |
| GET | `/api/employee/tasks/:id` | Approved employee | — | own assignment only | `403`/`404` |
| POST | `/api/employee/assignments/:id/submit` | Approved employee | Excel `file` | submission | `403` |
| POST | `/api/admin/submissions/:id/revision` | Admin | `feedback` | `REVISION_REQUIRED` | `404` |
| POST | `/api/admin/submissions/:id/approve` | Admin | `feedback` | completed | `404` |

Overdue status is set server-side when `now > deadline` and work is not completed.

---

## Attendance

| Method | URL | Auth | Request | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/attendance/check-in` `/check-out` | Approved employee | — | today's row | `400`/`409` |
| GET | `/api/attendance/today` `/history` | Approved employee | — | own rows | `403` |
| GET | `/api/admin/attendance` | Admin | `range=today\|week\|month`, `from`, `to`, `employeeId`, `department`, `page`, `limit` | paged rows | `403` |
| GET | `/api/admin/attendance/export` | Admin | same filters | CSV | `403` |
| POST/PATCH | `/api/admin/attendance` | Admin | employeeId, dateKey, status | upsert | `400` |

---

## Leave

| Method | URL | Auth | Request | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/leave` | Approved employee | `leaveTypeId`, `startDate`, `endDate`, `reason` | request | `409` overlap |
| GET | `/api/leave` | Approved employee | — | requests + balances | `403` |
| GET | `/api/admin/leave` | Admin | `status`, `employeeId`, `leaveTypeId`, `from`, `to`, `q`, `page`, `limit` | paged | `403` |
| POST | `/api/admin/leave/:id/approve` `/reject` | Admin | optional note | — | `409` |

Balances are created when verification is **approved** (idempotent).

---

## Payroll

| Method | URL | Auth | Request | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/employee/payroll` `/api/employee/salary` | Approved employee | — | own records only | `403` |
| GET | `/api/admin/payroll` | Admin | `q`, `month`, `year`, `page`, `limit` | paged | `403` |
| POST | `/api/admin/payroll` | Admin | employeeId, month, year, base/bonus/deductions, status (`PENDING\|PROCESSING\|PAID\|FAILED`), paymentDate, paymentRef, notes, optional `payslip` | saved record | `400` |
| GET/PUT | `/api/employee/bank` | Approved employee | bank fields | masked | `403` |
| POST | `/api/admin/bank/:employeeId/verify` | Admin | `status`, `reason` | — | `404` |

---

## Documents

| Method | URL | Auth | Request | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/documents` | Session | employees: own list; admin: paged | no `storageKey` | `403` |
| POST | `/api/documents` | Session | `title`, `category`, `file`, admin `employeeId` | — | `400` |
| GET | `/api/documents/:id/download` | Session | — | file bytes | `403` IDOR |
| GET | `/api/files/:id` | Session | — | authorized file only | `403` |
| GET | `/api/admin/documents` | Admin | `q`, `employeeId`, `page`, `limit` | paged | `403` |

Payslips are stored privately and downloaded through these authenticated endpoints.

---

## Notifications

| Method | URL | Auth | Request | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/notifications` | Session | — | own notifications | `401` |
| GET | `/api/notifications/unread-count` | Session | — | `{ count }` | `401` |
| PATCH | `/api/notifications/:id/read` | Session | — | — | `404` |
| POST | `/api/notifications/read-all` | Session | — | — | `401` |

---

## Admin / reports

| Method | URL | Auth | Request | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/admin/dashboard` | Admin | — | aggregates | `403` |
| GET | `/api/admin/audit` | Admin | `q`, `page`, `limit` | paged logs | `403` |
| GET/PATCH | `/api/admin/settings` | Admin | company, hours, payroll, security, notifications | settings | `403` |
| POST | `/api/admin/leave-types` | Admin | name, daysPerYear, paid, carryForward | — | `400` |
| GET | `/api/export/:type` | Admin | `csv=1` optional | Excel or CSV | `400` |
| GET | `/api/health` | Public | — | `{ status, database }` | `503` if DB down |
| GET | `/api/branding` | Public | — | `{ companyName, legalName, timezone, hasLogo }` | — |
| GET | `/api/branding/logo` | Public | — | logo image bytes | `404` if unset |

Audit logs never include passwords, PAN, full account numbers, government IDs, or file contents.
