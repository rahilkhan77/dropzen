/**
 * End-to-end workflow against a running DropZen API (and optionally the Next.js UI).
 * Requires: PostgreSQL + seeded database + API on PORT (default 4000).
 */
import ExcelJS from "exceljs";

const API = process.env.API_URL || "http://127.0.0.1:4000";
const WEB = process.env.FRONTEND_URL || "http://localhost:3000";

type Json = { success?: boolean; message?: string; data?: any; status?: string };

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

function fail(step: string, detail: string): never {
  throw new Error(`[${step}] ${detail}`);
}

async function parse(res: Response): Promise<Json> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Json;
  } catch {
    return { message: text.slice(0, 400) };
  }
}

async function req(
  session: Session,
  method: string,
  path: string,
  body?: BodyInit,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${API}${path}`, { method, headers: session.headers(headers), body });
  session.capture(res);
  return res;
}

async function form(session: Session, method: string, path: string, fields: Record<string, string>) {
  const params = new URLSearchParams(fields);
  return req(session, method, path, params, { "content-type": "application/x-www-form-urlencoded" });
}

async function expectOk(step: string, res: Response, allowed = [200, 201]) {
  const json = await parse(res);
  if (!allowed.includes(res.status) || json.success === false) {
    fail(step, `HTTP ${res.status} ${json.message || JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

async function xlsx(label: string) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Work");
  sheet.addRow(["Lead", "Status", "Notes"]);
  sheet.addRow(["Acme Corp", "Done", label]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

function mondayAhead(weeks = 6) {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  const add = (8 - d.getDay()) % 7;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

async function page(session: Session, path: string) {
  const res = await fetch(`${WEB}${path}`, { headers: session.headers(), redirect: "manual" });
  const html = await res.text();
  const bad =
    res.status >= 500 ||
    /Application error|Internal Server Error|Unhandled Runtime Error|Something went wrong|digest=|ReferenceError|is not defined/i.test(
      html,
    );
  if (bad) fail(`ui ${path}`, `HTTP ${res.status} ${html.slice(0, 240)}`);
  return { status: res.status, len: html.length };
}

async function activate(session: Session, inviteUrl: string, password: string) {
  const token = String(inviteUrl).split("/invite/")[1];
  if (!token) fail("invite token", String(inviteUrl));
  await expectOk(
    "activate invitation",
    await form(session, "POST", "/api/auth/activate", {
      token,
      password,
      confirmPassword: password,
    }),
  );
}

async function main() {
  const stamp = Date.now();
  const email = `e2e.${stamp}@dropzen.com`;
  const username = `e2e${stamp}`;
  const newPassword = "Employee@456";
  const admin = new Session();
  const employee = new Session();
  const other = new Session();

  const health = await fetch(`${API}/api/health`);
  const healthJson = await parse(health);
  if (health.status !== 200 || healthJson.status !== "ok") fail("health", JSON.stringify(healthJson));
  console.log("✓ health");

  await expectOk("admin login", await form(admin, "POST", "/api/auth/login", {
    identifier: "admin@dropzen.com",
    password: "Admin@1234",
  }));
  console.log("✓ admin login");

  const created = await expectOk(
    "create employee",
    await form(admin, "POST", "/api/admin/employees", {
      fullName: "E2E Workflow User",
      email,
      username,
      department: "Operations",
      designation: "Associate",
      joiningDate: "2026-08-01",
      phone: "9876500123",
    }),
    [201],
  );
  const employeeId = created.data.id as string;
  const inviteUrl = created.data.inviteUrl as string;
  if (!inviteUrl) fail("create employee", "inviteUrl missing in non-production response");
  console.log("✓ create employee", employeeId);

  await activate(employee, inviteUrl, newPassword);
  console.log("✓ employee accepted invitation and set password");

  const blockedDash = await req(employee, "GET", "/api/employee/dashboard");
  if (blockedDash.status !== 403) fail("kyc gate", `HTTP ${blockedDash.status}`);
  const blockedJson = await parse(blockedDash);
  if (blockedJson.code !== "KYC_REQUIRED") fail("kyc gate code", JSON.stringify(blockedJson));
  console.log("✓ unapproved employee blocked from dashboard");

  await expectOk(
    "kyc draft",
    await form(employee, "PATCH", "/api/employee/kyc", {
      fullName: "E2E Workflow User",
      dateOfBirth: "1996-04-12",
      gender: "FEMALE",
      phone: "9876500123",
      address: "221 B, Sample Street, Bengaluru",
      city: "Bengaluru",
      state: "Karnataka",
      pinCode: "560001",
      emergencyName: "Parent",
      emergencyPhone: "9876500999",
      pan: "ABCDE1234F",
      govIdType: "AADHAAR",
      govIdNumber: "234512345678",
      accountHolderName: "E2E Workflow User",
      bankName: "HDFC Bank",
      accountNumber: "50123400998877",
      ifsc: "HDFC0001234",
      upiId: "e2e@hdfc",
    }),
  );
  for (const category of ["ID", "PAN"]) {
    const fd = new FormData();
    fd.set("category", category);
    fd.set("title", category === "ID" ? "Identity document" : "PAN document");
    fd.append("file", new Blob([new Uint8Array(PDF)], { type: "application/pdf" }), `${category}.pdf`);
    await expectOk(`kyc upload ${category}`, await req(employee, "POST", "/api/employee/kyc/documents", fd));
  }
  await expectOk("kyc submit", await req(employee, "POST", "/api/employee/kyc/submit"));
  await expectOk("kyc approve", await req(admin, "POST", `/api/admin/kyc/${employeeId}/approve`));
  await expectOk("dashboard after approval", await req(employee, "GET", "/api/employee/dashboard"));
  const ownBank = await expectOk("own bank mask", await req(employee, "GET", "/api/employee/bank"));
  if (JSON.stringify(ownBank).includes("50123400998877")) fail("bank mask", "Full account number leaked");
  if (JSON.stringify(ownBank).includes("accountNumberEnc")) fail("bank mask", "Encrypted payload leaked");
  console.log("✓ verification submitted, approved, workspace unlocked");

  const checkIn = await req(employee, "POST", "/api/attendance/check-in");
  const checkInJson = await parse(checkIn);
  if (![200, 400, 409].includes(checkIn.status)) fail("check-in", checkInJson.message || String(checkIn.status));
  if (checkIn.status === 200) {
    const dup = await req(employee, "POST", "/api/attendance/check-in");
    if (![400, 409].includes(dup.status)) fail("duplicate check-in", `HTTP ${dup.status}`);
    console.log("✓ check-in + duplicate blocked");
  } else {
    console.log("• check-in skipped:", checkInJson.message);
  }

  const template = await xlsx("template");
  const taskFd = new FormData();
  taskFd.set("title", "E2E Excel enrichment");
  taskFd.set("instructions", "Download the template, fill every row, and upload the completed workbook.");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  taskFd.set("dateKey", today);
  taskFd.set("deadline", new Date(Date.now() + 36 * 3600 * 1000).toISOString());
  taskFd.set("priority", "HIGH");
  taskFd.set("employeeIds", employeeId);
  taskFd.set("estimatedHours", "4");
  taskFd.append(
    "template",
    new Blob([new Uint8Array(template)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "template.xlsx",
  );
  const taskRes = await req(admin, "POST", "/api/admin/tasks", taskFd);
  const taskJson = await expectOk("create task", taskRes, [201]);
  const taskId = taskJson.data.id as string;
  console.log("✓ excel task created", taskId);

  const mine = await expectOk("employee task", await req(employee, "GET", `/api/employee/tasks/${taskId}`));
  const assignmentId = mine.data.id as string;
  const templateFileId = mine.data.task.files.find((f: { kind: string }) => f.kind === "TEMPLATE")?.fileId;
  if (!templateFileId) fail("template", "No template file on task");
  const dl = await req(employee, "GET", `/api/files/${templateFileId}`);
  if (dl.status !== 200 || (await dl.arrayBuffer()).byteLength < 10) fail("download template", `HTTP ${dl.status}`);
  console.log("✓ employee received task and downloaded template");

  await expectOk("start task", await req(employee, "POST", `/api/employee/assignments/${assignmentId}/start`));
  const v1 = await xlsx("submission-1");
  const sub1 = new FormData();
  sub1.set("comments", "First pass complete");
  sub1.append(
    "file",
    new Blob([new Uint8Array(v1)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "work.xlsx",
  );
  await expectOk("submit v1", await req(employee, "POST", `/api/employee/assignments/${assignmentId}/submit`, sub1));

  const subs = await expectOk("list submissions", await req(admin, "GET", "/api/admin/submissions"));
  const mineSub = (subs.data as any[]).find((s) => s.assignment?.employeeId === employeeId);
  if (!mineSub) fail("submission", "Admin cannot see employee submission");
  await expectOk(
    "revision",
    await form(admin, "POST", `/api/admin/submissions/${mineSub.id}/revision`, {
      feedback: "Please add the missing status column.",
    }),
  );
  const v2 = await xlsx("submission-2");
  const sub2 = new FormData();
  sub2.set("comments", "Revised with status column");
  sub2.append(
    "file",
    new Blob([new Uint8Array(v2)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "work-v2.xlsx",
  );
  await expectOk("resubmit", await req(employee, "POST", `/api/employee/assignments/${assignmentId}/submit`, sub2));
  await expectOk(
    "approve",
    await form(admin, "POST", `/api/admin/submissions/${mineSub.id}/approve`, { feedback: "Looks good" }),
  );
  const after = await expectOk("completed status", await req(employee, "GET", `/api/employee/tasks/${taskId}`));
  if (!["COMPLETED", "APPROVED"].includes(after.data.status)) {
    fail("completed status", after.data.status);
  }
  if ((after.data.submissions?.[0]?.versions?.length ?? 0) < 2) {
    fail("versions", "Expected two submission versions to be preserved");
  }
  console.log("✓ excel submit → revision → resubmit → approve");

  const leaveData = await expectOk("leave types", await req(employee, "GET", "/api/leave"));
  const leaveTypeId = leaveData.data.types[0].id as string;
  const startDate = mondayAhead(8);
  await expectOk(
    "apply leave",
    await form(employee, "POST", "/api/leave", {
      leaveTypeId,
      startDate,
      endDate: startDate,
      reason: "Family appointment",
    }),
  );
  const pending = (await expectOk("my leave", await req(employee, "GET", "/api/leave"))).data.requests.find(
    (r: { status: string }) => r.status === "PENDING",
  );
  if (!pending) fail("leave pending", "No pending leave request");
  await expectOk("approve leave", await req(admin, "POST", `/api/admin/leave/${pending.id}/approve`));
  console.log("✓ leave apply + approve");

  const payFd = new FormData();
  payFd.set("employeeId", employeeId);
  payFd.set("month", "8");
  payFd.set("year", "2026");
  payFd.set("amount", "42000");
  payFd.set("status", "PAID");
  payFd.set("paymentDate", "2026-08-31");
  payFd.set("paymentRef", "NEFT-E2E-001");
  payFd.append("payslip", new Blob([new Uint8Array(PDF)], { type: "application/pdf" }), "payslip.pdf");
  await expectOk("salary + payslip", await req(admin, "POST", "/api/admin/payroll", payFd));
  const payroll = await expectOk("employee payroll", await req(employee, "GET", "/api/employee/salary"));
  const slip = (payroll.data as any[])[0];
  if (!slip?.payslipFileId) fail("payslip", "Payslip file missing on salary record");
  const slipFile = await req(employee, "GET", `/api/files/${slip.payslipFileId}`);
  if (slipFile.status !== 200) fail("download payslip", `HTTP ${slipFile.status}`);
  const docs = await expectOk("documents", await req(employee, "GET", "/api/documents"));
  const payslipDoc = (docs.data as any[]).find((d) => d.category === "PAYSLIP");
  if (!payslipDoc) fail("payslip document", "Payslip not listed in documents");
  const docDl = await req(employee, "GET", `/api/documents/${payslipDoc.id}/download`);
  if (docDl.status !== 200) fail("document download", `HTTP ${docDl.status}`);
  console.log("✓ salary + secure payslip download");

  const otherEmail = `e2e.b.${stamp}@dropzen.com`;
  const otherUser = `e2eb${stamp}`;
  const otherCreated = await expectOk(
    "create isolation employee",
    await form(admin, "POST", "/api/admin/employees", {
      fullName: "E2E Isolation User",
      email: otherEmail,
      username: otherUser,
      department: "Operations",
      designation: "Associate",
      joiningDate: "2026-08-01",
      phone: "9876500456",
    }),
    [201],
  );
  const otherId = otherCreated.data.id as string;
  await activate(other, otherCreated.data.inviteUrl, newPassword);
  await expectOk(
    "other kyc",
    await form(other, "PATCH", "/api/employee/kyc", {
      fullName: "E2E Isolation User",
      dateOfBirth: "1994-02-02",
      gender: "MALE",
      phone: "9876500456",
      address: "9 Residency Road",
      city: "Bengaluru",
      state: "Karnataka",
      pinCode: "560025",
      emergencyName: "Sibling",
      emergencyPhone: "9876500888",
      pan: "XYZAB5678C",
      govIdType: "PASSPORT",
      govIdNumber: "N1234567",
      accountHolderName: "E2E Isolation User",
      bankName: "ICICI Bank",
      accountNumber: "50123400990011",
      ifsc: "ICIC0001234",
    }),
  );
  for (const category of ["ID", "PAN"]) {
    const fd = new FormData();
    fd.set("category", category);
    fd.set("title", category);
    fd.append("file", new Blob([new Uint8Array(PDF)], { type: "application/pdf" }), `${category}.pdf`);
    await expectOk(`other kyc upload ${category}`, await req(other, "POST", "/api/employee/kyc/documents", fd));
  }
  await expectOk("other kyc submit", await req(other, "POST", "/api/employee/kyc/submit"));
  await expectOk("other kyc approve", await req(admin, "POST", `/api/admin/kyc/${otherId}/approve`));

  const stolenBank = await req(other, "GET", `/api/admin/bank/${employeeId}?reveal=1`);
  if (stolenBank.status !== 403) fail("isolation bank", `HTTP ${stolenBank.status}`);
  const stolenEmp = await req(other, "GET", `/api/admin/employees/${employeeId}`);
  if (stolenEmp.status !== 403) fail("isolation employee", `HTTP ${stolenEmp.status}`);
  const stolenPay = await req(other, "GET", "/api/employee/salary");
  const stolenPayJson = await parse(stolenPay);
  if ((stolenPayJson.data ?? []).some((r: { employeeId: string }) => r.employeeId === employeeId)) {
    fail("isolation payroll", "Other employee received E2E payroll");
  }
  const stolenDoc = await req(other, "GET", `/api/documents/${payslipDoc.id}/download`);
  if (stolenDoc.status !== 403) fail("isolation document", `HTTP ${stolenDoc.status}`);
  const stolenFile = await req(other, "GET", `/api/files/${slip.payslipFileId}`);
  if (![403, 404].includes(stolenFile.status)) fail("isolation file", `HTTP ${stolenFile.status}`);
  const stolenTask = await req(other, "GET", `/api/employee/tasks/${taskId}`);
  if (![403, 404].includes(stolenTask.status)) fail("isolation task", `HTTP ${stolenTask.status}`);
  console.log("✓ employee isolation");

  const neededAudit = [
    "EMPLOYEE_CREATED",
    "INVITATION_SENT",
    "INVITATION_ACCEPTED",
    "KYC_SUBMITTED",
    "KYC_APPROVED",
    "BANK_DETAILS_UPDATED",
    "TASK_CREATED",
    "TASK_ASSIGNED",
    "TASK_SUBMITTED",
    "TASK_REVISION_REQUESTED",
    "TASK_APPROVED",
    "LEAVE_APPROVED",
    "SALARY_CREATED",
    "SALARY_PAID",
    "DOCUMENT_UPLOADED",
  ];
  for (const needed of neededAudit) {
    const page = await expectOk(`audit ${needed}`, await req(admin, "GET", `/api/admin/audit?q=${encodeURIComponent(needed)}&limit=100`));
    const actions = JSON.stringify(page.data?.items ?? page.data);
    if (!actions.includes(needed)) fail("audit", `Missing ${needed}`);
  }
  const empAudit = await req(employee, "GET", "/api/admin/audit");
  if (empAudit.status !== 403) fail("audit authz", `HTTP ${empAudit.status}`);
  console.log("✓ audit log (admin only)");

  for (const report of ["attendance.csv", "payroll.csv", "tasks.csv", "employees.csv"]) {
    const csv = await req(admin, "GET", `/api/admin/reports/${report}`);
    if (csv.status !== 200) fail(`report ${report}`, `HTTP ${csv.status}`);
    const text = await csv.text();
    if (!text.includes(",") && !text.length) fail(`report ${report}`, "empty");
  }
  const blockedCsv = await req(employee, "GET", "/api/admin/reports/employees.csv");
  if (blockedCsv.status !== 403) fail("report authz", `HTTP ${blockedCsv.status}`);
  console.log("✓ admin CSV exports");

  const notes = await expectOk("notifications", await req(employee, "GET", "/api/notifications"));
  if (!Array.isArray(notes.data) || notes.data.length === 0) fail("notifications", "none");
  console.log("✓ notifications");

  try {
    const webHealth = await fetch(`${WEB}/login`);
    if (webHealth.ok) {
      const adminWeb = new Session();
      const login = await fetch(`${WEB}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ identifier: "admin@dropzen.com", password: "Admin@1234" }),
      });
      adminWeb.capture(login);
      for (const p of [
        "/dashboard",
        "/admin/employees",
        "/admin/verification",
        "/admin/tasks",
        "/admin/attendance",
        "/admin/leave",
        "/admin/payroll",
        "/admin/documents",
        "/admin/announcements",
        "/admin/settings",
        "/admin/audit",
        "/admin/reports",
        `/admin/employees/${employeeId}`,
        `/admin/tasks/${taskId}`,
      ]) {
        const r = await page(adminWeb, p);
        console.log(`  ui admin ${p} ${r.status} (${r.len}b)`);
      }
      const empWeb = new Session();
      const el = await fetch(`${WEB}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ identifier: email, password: newPassword }),
      });
      empWeb.capture(el);
      for (const p of [
        "/dashboard",
        "/employee/kyc",
        "/profile",
        "/attendance",
        "/tasks",
        `/tasks/${taskId}`,
        "/leave",
        "/bank",
        "/salary",
        "/documents",
        "/notifications",
      ]) {
        const r = await page(empWeb, p);
        console.log(`  ui employee ${p} ${r.status} (${r.len}b)`);
      }
      const adminGate = await page(empWeb, "/admin/employees");
      if (![200, 302, 303, 307, 308].includes(adminGate.status)) {
        fail("ui admin gate", `HTTP ${adminGate.status}`);
      }
      console.log("✓ Next.js pages loaded");
    } else {
      fail("ui sweep", `frontend /login HTTP ${webHealth.status}`);
    }
  } catch (err) {
    fail("ui sweep", err instanceof Error ? err.message : String(err));
  }

  console.log("\nE2E workflow passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
