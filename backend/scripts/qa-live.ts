/**
 * Live QA against the running DropZen API, Next.js UI, and PostgreSQL.
 * Creates a fresh employee — no demo/mock records.
 */
import "dotenv/config";
import ExcelJS from "exceljs";
import { prisma } from "../src/config/db.js";
import { decryptText } from "../src/utils/crypto.js";

const API = process.env.API_URL || "http://127.0.0.1:4000";
const WEB = process.env.FRONTEND_URL || "http://localhost:3000";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

type Json = { success?: boolean; message?: string; data?: any; code?: string; status?: string };

class Session {
  cookie = "";
  headers(extra: Record<string, string> = {}) {
    return this.cookie ? { cookie: this.cookie, ...extra } : extra;
  }
  capture(res: Response) {
    const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const pair = raw.split(";")[0];
      if (pair) this.cookie = pair;
    }
  }
}

const results: { step: string; ok: boolean; detail?: string }[] = [];

function fail(step: string, detail: string): never {
  results.push({ step, ok: false, detail });
  throw new Error(`[FAIL ${step}] ${detail}`);
}

function pass(step: string, detail = "") {
  results.push({ step, ok: true, detail });
  console.log(`✓ ${step}${detail ? ` — ${detail}` : ""}`);
}

async function parse(res: Response): Promise<Json> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Json;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

async function api(session: Session, method: string, path: string, body?: BodyInit, headers: Record<string, string> = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: session.headers(headers), body });
  session.capture(res);
  return res;
}

async function form(session: Session, method: string, path: string, fields: Record<string, string>) {
  return api(session, method, path, new URLSearchParams(fields), {
    "content-type": "application/x-www-form-urlencoded",
  });
}

async function expectStatus(step: string, res: Response, allowed: number[]) {
  const json = await parse(res);
  if (!allowed.includes(res.status)) {
    fail(step, `HTTP ${res.status} ${json.code || ""} ${json.message || JSON.stringify(json).slice(0, 240)}`);
  }
  return json;
}

async function expectOk(step: string, res: Response, allowed = [200, 201]) {
  const json = await expectStatus(step, res, allowed);
  if (json.success === false) fail(step, json.message || "success=false");
  return json;
}

async function expectKycRequired(step: string, res: Response) {
  const json = await parse(res);
  if (res.status !== 403 || json.code !== "KYC_REQUIRED") {
    fail(step, `expected 403 KYC_REQUIRED, got ${res.status} ${json.code} ${json.message}`);
  }
  pass(step);
}

async function xlsx(label: string) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Work");
  sheet.addRow(["Lead", "Status", "Notes"]);
  sheet.addRow(["Acme Corp", "Done", label]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function mondayAhead(weeks = 8) {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  const add = (8 - d.getDay()) % 7;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

async function completeKyc(session: Session, opts: { fullName: string; pan: string; account: string; city?: string }) {
  await expectOk(
    `kyc draft ${opts.fullName}`,
    await form(session, "PATCH", "/api/employee/kyc", {
      fullName: opts.fullName,
      dateOfBirth: "1995-06-18",
      gender: "FEMALE",
      phone: "9876512345",
      address: "14 Residency Road",
      city: opts.city ?? "Bengaluru",
      state: "Karnataka",
      pinCode: "560025",
      emergencyName: "Parent Contact",
      emergencyPhone: "9876512999",
      pan: opts.pan,
      govIdType: "AADHAAR",
      govIdNumber: "234512349876",
      accountHolderName: opts.fullName,
      bankName: "HDFC Bank",
      accountNumber: opts.account,
      ifsc: "HDFC0001234",
      upiId: "qa@hdfc",
    }),
  );
  for (const category of ["ID", "PAN", "BANK_PROOF"] as const) {
    const fd = new FormData();
    fd.set("category", category);
    fd.set("title", category === "ID" ? "Identity document" : category === "PAN" ? "PAN document" : "Bank proof");
    fd.append("file", new Blob([new Uint8Array(PDF)], { type: "application/pdf" }), `${category}.pdf`);
    await expectOk(`kyc upload ${category}`, await api(session, "POST", "/api/employee/kyc/documents", fd));
  }
  await expectOk("kyc submit", await api(session, "POST", "/api/employee/kyc/submit"));
}

async function page(session: Session, path: string) {
  return fetch(`${WEB}${path}`, { headers: session.headers(), redirect: "manual" });
}

async function createEmployee(admin: Session, stamp: string, name: string, extra: Record<string, string> = {}) {
  const email = `live.${stamp}@dropzen.com`;
  const created = await expectOk(
    `create ${name}`,
    await form(admin, "POST", "/api/admin/employees", {
      fullName: name,
      email,
      username: `live${stamp}`,
      department: "Operations",
      designation: "Associate",
      joiningDate: "2026-08-03",
      phone: "9876501111",
      ...extra,
    }),
    [201],
  );
  return { id: created.data.id as string, email, inviteUrl: created.data.inviteUrl as string };
}

async function activateEmployee(session: Session, inviteUrl: string, password: string) {
  const token = String(inviteUrl).split("/invite/")[1];
  await expectOk(
    "activate",
    await form(session, "POST", "/api/auth/activate", {
      token,
      password,
      confirmPassword: password,
    }),
  );
}

async function loginEmployee(session: Session, email: string, password: string) {
  await expectOk("login", await form(session, "POST", "/api/auth/login", { identifier: email, password }));
}

async function main() {
  const stamp = `${Date.now()}`;
  const admin = new Session();
  const emp = new Session();
  const other = new Session();
  const webAdmin = new Session();
  const webEmp = new Session();

  const health = await fetch(`${API}/api/health`);
  const healthJson = await parse(health);
  if (health.status !== 200 || healthJson.status !== "ok") fail("health", JSON.stringify(healthJson));
  pass("API health");

  await expectOk("admin login", await form(admin, "POST", "/api/auth/login", {
    identifier: "admin@dropzen.com",
    password: "Admin@1234",
  }));
  const loginBody = JSON.stringify(await (await api(admin, "GET", "/api/auth/me")).json());
  if (/passwordHash|Admin@1234/.test(loginBody)) fail("auth leak", "password material in /me");
  pass("admin session has no password material");

  const created = await createEmployee(admin, `${stamp}a`, "Live QA Employee");
  const employeeId = created.id;

  const row = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: true, salaryRecords: true, attendance: true, assignments: true, documents: true, leaveRequests: true, leaveBalances: true },
  });
  if (!row) fail("db employee", "missing");
  if (row.kycStatus !== "NOT_STARTED") fail("kyc status", row.kycStatus);
  if (row.salaryRecords.length) fail("no salary", String(row.salaryRecords.length));
  if (row.attendance.length) fail("no attendance", String(row.attendance.length));
  if (row.assignments.length) fail("no tasks", String(row.assignments.length));
  if (row.documents.length) fail("no documents", String(row.documents.length));
  if (row.leaveRequests.length) fail("no leave requests", String(row.leaveRequests.length));
  if (row.leaveBalances.length) fail("no leave balances before approval", String(row.leaveBalances.length));
  if (row.user.status !== "INVITED") fail("invited status", row.user.status);
  pass("PostgreSQL: invited employee, KYC NOT_STARTED, no operational records");

  await activateEmployee(emp, created.inviteUrl, "Employee@456");
  const me = await expectOk("me", await api(emp, "GET", "/api/auth/me"));
  if (me.data.redirectTo && me.data.redirectTo !== "/employee/kyc") {
    /* login already returned redirectTo */
  }
  const loginAgain = await expectOk(
    "login redirect",
    await form(new Session(), "POST", "/api/auth/login", { identifier: created.email, password: "Employee@456" }),
  );
  if (loginAgain.data.redirectTo !== "/employee/kyc") fail("login redirectTo", String(loginAgain.data.redirectTo));
  pass("login redirects unapproved employee to /employee/kyc");

  for (const path of [
    "/api/employee/dashboard",
    "/api/employee/tasks",
    "/api/attendance/today",
    "/api/leave",
    "/api/employee/salary",
    "/api/documents",
    "/api/employee/bank",
  ]) {
    await expectKycRequired(`gate ${path}`, await api(emp, "GET", path));
  }

  const webLogin = await fetch(`${WEB}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ identifier: created.email, password: "Employee@456" }),
    redirect: "manual",
  });
  webEmp.capture(webLogin);
  for (const path of ["/dashboard", "/tasks", "/attendance", "/leave", "/salary", "/documents", "/bank", "/bank-details"]) {
    const res = await page(webEmp, path);
    const loc = res.headers.get("location") || "";
    if (![302, 303, 307, 308].includes(res.status) || !loc.includes("/employee/kyc")) {
      if (res.status === 200 && path === "/employee/kyc") continue;
      fail(`ui gate ${path}`, `HTTP ${res.status} location=${loc}`);
    }
  }
  const kycPage = await page(webEmp, "/employee/kyc");
  if (kycPage.status !== 200) fail("ui kyc page", `HTTP ${kycPage.status}`);
  pass("browser proxy blocks operational pages until verification");

  await completeKyc(emp, { fullName: "Live QA Employee", pan: "AAAPA1111A", account: "11112222333344" });
  const pending = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (pending?.kycStatus !== "PENDING_VERIFICATION") fail("pending status", String(pending?.kycStatus));
  const locked = await api(emp, "PATCH", "/api/employee/kyc", new URLSearchParams({ city: "Mysuru" }), {
    "content-type": "application/x-www-form-urlencoded",
  });
  if (locked.status !== 403) fail("locked after submit", `HTTP ${locked.status}`);
  pass("submitted KYC is PENDING_VERIFICATION and locked");

  const files = await prisma.fileAsset.findMany({ where: { employeeId } });
  if (files.length < 3) fail("secure files", `only ${files.length} files`);
  const sample = files[0];
  const publicNext = await fetch(`${WEB}/uploads/${sample.storageKey}`);
  const publicApi = await fetch(`${API}/uploads/${sample.storageKey}`);
  const nextBuf = Buffer.from(await publicNext.arrayBuffer());
  const apiBuf = Buffer.from(await publicApi.arrayBuffer());
  const leaked =
    (publicNext.status === 200 && nextBuf.subarray(0, 5).toString() === "%PDF-") ||
    (publicApi.status === 200 && apiBuf.subarray(0, 5).toString() === "%PDF-");
  if (leaked) fail("public file", "upload served without auth");
  const anonFile = await fetch(`${API}/api/files/${sample.id}`);
  if (anonFile.status !== 401) fail("anon file", `HTTP ${anonFile.status}`);
  const ownFile = await api(emp, "GET", `/api/files/${sample.id}`);
  if (ownFile.status !== 200) fail("own kyc file", `HTTP ${ownFile.status}`);
  pass("KYC files stored privately; unauthenticated download blocked");

  const dbEmp = await prisma.employee.findUnique({ where: { id: employeeId }, include: { bankDetails: true } });
  if (!dbEmp?.panEnc || dbEmp.panEnc.includes("AAAPA1111A")) fail("pan encryption", "plaintext PAN in database");
  if (!dbEmp.bankDetails?.accountNumberEnc || dbEmp.bankDetails.accountNumberEnc.includes("11112222333344")) {
    fail("bank encryption", "plaintext account in database");
  }
  const decrypted = decryptText(dbEmp.bankDetails!.accountNumberEnc);
  if (decrypted !== "11112222333344") fail("bank decrypt", decrypted);
  const kycJson = JSON.stringify((await expectOk("own kyc", await api(emp, "GET", "/api/employee/kyc"))).data);
  if (kycJson.includes("11112222333344") || kycJson.includes("AAAPA1111A") || kycJson.includes("234512349876")) {
    fail("kyc mask", kycJson.slice(0, 400));
  }
  pass("PAN/bank encrypted at rest and masked in employee API");

  const listed = await expectOk("admin kyc list", await api(admin, "GET", "/api/admin/kyc"));
  if (!listed.data.some((r: { id: string }) => r.id === employeeId)) fail("admin kyc list", "employee missing");
  const noReason = await form(admin, "POST", `/api/admin/kyc/${employeeId}/correction`, { reason: "" });
  await expectStatus("correction requires reason", noReason, [400]);
  await expectOk(
    "request correction",
    await form(admin, "POST", `/api/admin/kyc/${employeeId}/correction`, {
      reason: "City must match the address proof.",
    }),
  );
  const afterCorr = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (afterCorr?.kycStatus !== "INCOMPLETE") fail("correction status", String(afterCorr?.kycStatus));
  if (afterCorr?.kycRejectionReason !== "City must match the address proof.") fail("correction reason", String(afterCorr?.kycRejectionReason));
  const notes = await expectOk("employee notifications after correction", await api(emp, "GET", "/api/notifications"));
  if (!notes.data.some((n: { body: string }) => n.body.includes("City must match"))) fail("correction notification", "missing");
  await expectOk("edit after correction", await form(emp, "PATCH", "/api/employee/kyc", { city: "Bengaluru" }));
  await expectOk("resubmit", await api(emp, "POST", "/api/employee/kyc/submit"));
  await expectOk("approve", await api(admin, "POST", `/api/admin/kyc/${employeeId}/approve`));
  const approved = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (approved?.kycStatus !== "APPROVED") fail("approved status", String(approved?.kycStatus));
  const audit = await prisma.auditLog.findMany({ where: { entityId: employeeId } });
  for (const action of ["KYC_SUBMITTED", "KYC_CORRECTION_REQUESTED", "KYC_APPROVED"]) {
    if (!audit.some((a) => a.action === action)) fail("audit", `missing ${action}`);
  }
  const afterApproveNotes = await expectOk("kyc approved notification", await api(emp, "GET", "/api/notifications"));
  if (!afterApproveNotes.data.some((n: { title: string }) => /approved/i.test(n.title))) fail("approve notification", "missing");
  pass("correction → resubmit → approve, audit + notifications");

  const webEmpFresh = await fetch(`${WEB}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ identifier: created.email, password: "Employee@456" }),
  });
  webEmp.capture(webEmpFresh);

  const dash = await expectOk("dashboard unlocked", await api(emp, "GET", "/api/employee/dashboard"));
  if (dash.data.salary !== null) fail("empty salary", "unexpected salary");
  if (dash.data.todayTasks?.length) fail("empty tasks", "unexpected tasks");
  const salaryEmpty = await expectOk("salary empty", await api(emp, "GET", "/api/employee/salary"));
  if (salaryEmpty.data.length !== 0) fail("salary empty list", JSON.stringify(salaryEmpty.data));
  const webDash = await page(webEmp, "/dashboard");
  if (![200, 307, 308, 302].includes(webDash.status)) fail("ui dashboard", `HTTP ${webDash.status}`);
  const salaryHtml = await fetch(`${WEB}/salary`, { headers: webEmp.headers(), redirect: "follow" });
  const salaryText = await salaryHtml.text();
  if (!/No salary records available yet/i.test(salaryText)) fail("salary empty state", salaryText.slice(0, 300));
  if (/₹64,000|₹62,000|Priya Sharma/.test(salaryText)) fail("salary mock", "fake amounts in HTML");
  pass("dashboard unlocked; empty salary state; no mock amounts");

  const unread0 = await expectOk("unread before task", await api(emp, "GET", "/api/notifications/unread-count"));
  const template = await xlsx("template");
  const taskFd = new FormData();
  taskFd.set("title", "Live QA Excel enrichment");
  taskFd.set("description", "Enrich assigned marketplace leads");
  taskFd.set("instructions", "Download the template, complete every row, upload the workbook.");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  taskFd.set("dateKey", today);
  taskFd.set("deadline", new Date(Date.now() + 36 * 3600 * 1000).toISOString());
  taskFd.set("priority", "HIGH");
  taskFd.set("employeeIds", employeeId);
  taskFd.append(
    "template",
    new Blob([new Uint8Array(template)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "template.xlsx",
  );
  const taskJson = await expectOk("create task", await api(admin, "POST", "/api/admin/tasks", taskFd), [201]);
  const taskId = taskJson.data.id as string;
  const dbTask = await prisma.task.findUnique({ where: { id: taskId }, include: { assignments: true } });
  if (!dbTask || dbTask.assignments.length !== 1 || dbTask.assignments[0].employeeId !== employeeId) {
    fail("task assignment row", JSON.stringify(dbTask?.assignments));
  }
  pass("Task + TaskAssignment stored");

  const unread1 = await expectOk("unread after task", await api(emp, "GET", "/api/notifications/unread-count"));
  if (unread1.data.count <= unread0.data.count) fail("task notification count", `${unread0.data.count} -> ${unread1.data.count}`);
  const mine = await expectOk("employee task", await api(emp, "GET", `/api/employee/tasks/${taskId}`));
  const assignmentId = mine.data.id as string;
  const templateFileId = mine.data.task.files.find((f: { kind: string }) => f.kind === "TEMPLATE")?.fileId;
  const dl = await api(emp, "GET", `/api/files/${templateFileId}`);
  if (dl.status !== 200) fail("download template", `HTTP ${dl.status}`);
  await expectOk("start", await api(emp, "POST", `/api/employee/assignments/${assignmentId}/start`));
  const v1 = await xlsx("submission-1");
  const sub1 = new FormData();
  sub1.set("comments", "First pass");
  sub1.append("file", new Blob([new Uint8Array(v1)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "work.xlsx");
  await expectOk("submit v1", await api(emp, "POST", `/api/employee/assignments/${assignmentId}/submit`, sub1));
  const versions1 = await prisma.submissionVersion.count({ where: { submission: { assignmentId } } });
  if (versions1 !== 1) fail("version 1", String(versions1));
  const subs = await expectOk("admin submissions", await api(admin, "GET", "/api/admin/submissions"));
  const mineSub = (subs.data as any[]).find((s) => s.assignment?.employeeId === employeeId);
  await expectOk("revision", await form(admin, "POST", `/api/admin/submissions/${mineSub.id}/revision`, { feedback: "Add status column" }));
  const v2 = await xlsx("submission-2");
  const sub2 = new FormData();
  sub2.set("comments", "Revised");
  sub2.append("file", new Blob([new Uint8Array(v2)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "work-v2.xlsx");
  await expectOk("submit v2", await api(emp, "POST", `/api/employee/assignments/${assignmentId}/submit`, sub2));
  await expectOk("approve task", await form(admin, "POST", `/api/admin/submissions/${mineSub.id}/approve`, { feedback: "Looks good" }));
  const done = await prisma.taskAssignment.findUnique({ where: { id: assignmentId }, include: { submissions: { include: { versions: true } } } });
  if (!done || !["COMPLETED", "APPROVED"].includes(done.status)) fail("task completed", String(done?.status));
  if ((done.submissions[0]?.versions.length ?? 0) < 2) fail("two versions", String(done.submissions[0]?.versions.length));
  pass("Excel submit → revision → resubmit → COMPLETED with two versions");

  const payFd = new FormData();
  payFd.set("employeeId", employeeId);
  payFd.set("month", "8");
  payFd.set("year", "2026");
  payFd.set("amount", "41500");
  payFd.set("status", "PAID");
  payFd.set("paymentDate", "2026-08-31");
  payFd.set("paymentRef", "NEFT-LIVE-001");
  payFd.append("payslip", new Blob([new Uint8Array(PDF)], { type: "application/pdf" }), "payslip.pdf");
  await expectOk("create salary", await api(admin, "POST", "/api/admin/payroll", payFd));
  const pay = await expectOk("employee salary", await api(emp, "GET", "/api/employee/salary"));
  const slip = pay.data[0];
  if (slip.status !== "PAID" || slip.amount !== 41500) fail("salary record", JSON.stringify(slip));
  const slipFile = await api(emp, "GET", `/api/files/${slip.payslipFileId}`);
  if (slipFile.status !== 200) fail("payslip download", `HTTP ${slipFile.status}`);
  pass("salary created, PAID, authenticated payslip download");

  const checkIn = await api(emp, "POST", "/api/attendance/check-in");
  const checkJson = await parse(checkIn);
  if (![200, 400, 409].includes(checkIn.status)) fail("check-in", checkJson.message || String(checkIn.status));
  if (checkIn.status === 200) {
    const dup = await api(emp, "POST", "/api/attendance/check-in");
    if (![400, 409].includes(dup.status)) fail("duplicate check-in", `HTTP ${dup.status}`);
    const spoof = await form(emp, "POST", "/api/attendance/check-in", { employeeId: "00000000-0000-0000-0000-000000000000", dateKey: "2020-01-01" });
    if (![400, 409].includes(spoof.status)) fail("spoof check-in", `HTTP ${spoof.status}`);
    const att = await prisma.attendance.findMany({ where: { employeeId } });
    if (!att.length) fail("attendance persisted", "none");
    pass("attendance marked, duplicate rejected, body employeeId ignored");
  } else {
    pass("check-in skipped (non-working day or already marked)", checkJson.message);
  }

  const leaveType = (await expectOk("leave types", await api(emp, "GET", "/api/leave"))).data.types[0].id as string;
  const startDate = mondayAhead(8);
  await expectOk("apply leave", await form(emp, "POST", "/api/leave", { leaveTypeId: leaveType, startDate, endDate: startDate, reason: "Family appointment" }));
  const pendingLeave = (await expectOk("my leave", await api(emp, "GET", "/api/leave"))).data.requests.find((r: { status: string }) => r.status === "PENDING");
  await expectOk("approve leave", await api(admin, "POST", `/api/admin/leave/${pendingLeave.id}/approve`));
  const approvedLeave = await prisma.leaveRequest.findUnique({ where: { id: pendingLeave.id } });
  if (approvedLeave?.status !== "APPROVED") fail("leave approved", String(approvedLeave?.status));
  pass("leave request approved in PostgreSQL");

  const beforeRead = await expectOk("unread before mark", await api(emp, "GET", "/api/notifications/unread-count"));
  const firstUnread = (await expectOk("list notes", await api(emp, "GET", "/api/notifications"))).data.find((n: { readAt: string | null }) => !n.readAt);
  if (firstUnread) {
    await expectOk("mark read", await api(emp, "PATCH", `/api/notifications/${firstUnread.id}/read`));
    const afterRead = await expectOk("unread after mark", await api(emp, "GET", "/api/notifications/unread-count"));
    if (afterRead.data.count >= beforeRead.data.count) fail("unread decrease", `${beforeRead.data.count} -> ${afterRead.data.count}`);
  }
  pass("unread count is database-driven and decreases on read");

  const b = await createEmployee(admin, `${stamp}b`, "Live Isolation Employee");
  await activateEmployee(other, b.inviteUrl, "Employee@789");
  await completeKyc(other, { fullName: "Live Isolation Employee", pan: "BBBPB2222B", account: "99998888777766", city: "Chennai" });
  await expectOk("approve B", await api(admin, "POST", `/api/admin/kyc/${b.id}/approve`));

  const stolenTask = await api(other, "GET", `/api/employee/tasks/${taskId}`);
  if (![403, 404].includes(stolenTask.status)) fail("isolation task", `HTTP ${stolenTask.status}`);
  const stolenPay = await expectOk("b salary", await api(other, "GET", "/api/employee/salary"));
  if ((stolenPay.data ?? []).some((r: { employeeId: string }) => r.employeeId === employeeId)) fail("isolation salary", "B saw A's payroll");
  const stolenBank = await api(other, "GET", `/api/admin/bank/${employeeId}?reveal=1`);
  if (stolenBank.status !== 403) fail("isolation bank", `HTTP ${stolenBank.status}`);
  const stolenEmp = await api(other, "GET", `/api/admin/employees/${employeeId}`);
  if (stolenEmp.status !== 403) fail("isolation employee", `HTTP ${stolenEmp.status}`);
  const docs = await prisma.document.findFirst({ where: { employeeId } });
  if (docs) {
    const stolenDoc = await api(other, "GET", `/api/documents/${docs.id}/download`);
    if (stolenDoc.status !== 403) fail("isolation document", `HTTP ${stolenDoc.status}`);
    const stolenFile = await api(other, "GET", `/api/files/${docs.fileId}`);
    if (![401, 403, 404].includes(stolenFile.status)) fail("isolation file", `HTTP ${stolenFile.status}`);
  }
  const hist = await expectOk("b attendance history", await api(other, "GET", `/api/attendance/history?employeeId=${employeeId}`));
  if ((hist.data ?? []).some((r: { employeeId: string }) => r.employeeId === employeeId)) fail("isolation attendance", "B received A's rows");
  const bLeave = await expectOk("b leave", await api(other, "GET", `/api/leave?employeeId=${employeeId}`));
  if ((bLeave.data.requests ?? []).some((r: { employeeId?: string }) => r.employeeId === employeeId)) {
    fail("isolation leave", "B received A's requests");
  }
  const bNotes = await expectOk("b notifications", await api(other, "GET", "/api/notifications"));
  if ((bNotes.data ?? []).some((n: { body: string }) => /Live QA Excel/i.test(n.body || n.title))) {
    fail("isolation notifications", "B received A's task notification");
  }
  const adminEmpJson = JSON.stringify((await expectOk("admin emp json", await api(admin, "GET", `/api/admin/employees/${employeeId}`))).data);
  if (/panEnc|accountNumberEnc|passwordHash|11112222333344|AAAPA1111A/.test(adminEmpJson)) {
    fail("admin emp secrets", "ciphertext or plaintext secrets in employee payload");
  }
  pass("Employee B cannot access Employee A resources (API IDOR)");

  const webAdminLogin = await fetch(`${WEB}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ identifier: "admin@dropzen.com", password: "Admin@1234" }),
  });
  webAdmin.capture(webAdminLogin);
  for (const p of [
    "/dashboard",
    "/admin/employees",
    "/admin/verification",
    `/admin/verification/${employeeId}`,
    "/admin/tasks",
    `/admin/tasks/${taskId}`,
    "/admin/attendance",
    "/admin/leave",
    "/admin/payroll",
    "/admin/documents",
    "/notifications",
  ]) {
    const r = await page(webAdmin, p);
    if (r.status >= 500) fail(`ui admin ${p}`, `HTTP ${r.status}`);
  }
  const empWebLogin = await fetch(`${WEB}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ identifier: created.email, password: "Employee@456" }),
  });
  const empWeb = new Session();
  empWeb.capture(empWebLogin);
  for (const p of ["/dashboard", "/tasks", `/tasks/${taskId}`, "/attendance", "/leave", "/salary", "/documents", "/profile", "/bank", "/notifications", "/employee/kyc"]) {
    const r = await page(empWeb, p);
    if (r.status >= 500) fail(`ui employee ${p}`, `HTTP ${r.status}`);
    const html = r.status === 200 ? await r.text() : "";
    if (/Application error|Internal Server Error|Unhandled Runtime Error/i.test(html)) fail(`ui crash ${p}`, html.slice(0, 200));
  }
  const still = await prisma.employee.findUnique({ where: { id: employeeId }, include: { salaryRecords: true, assignments: true, attendance: true } });
  if (!still || !still.salaryRecords.length || !still.assignments.length) fail("db still present", "records vanished");
  pass("UI pages load without 500s; records remain in PostgreSQL");

  console.log("\nLive QA passed.");
  console.log(`Employee A: ${created.email} / Employee@456  id=${employeeId}`);
  console.log(`Employee B: ${b.email} / Employee@789  id=${b.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
