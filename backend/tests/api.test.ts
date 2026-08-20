import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/db.js";

const app = createApp();
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

function agent() {
  return request.agent(app);
}

async function login(session: ReturnType<typeof agent>, identifier: string, password: string) {
  const res = await session.post("/api/auth/login").type("form").send({ identifier, password });
  expect(res.status).toBe(200);
  return res;
}

async function createEmployee(
  admin: ReturnType<typeof agent>,
  stamp: string,
  name: string,
) {
  const email = `qa.${stamp}@dropzen.com`;
  const res = await admin.post("/api/admin/employees").type("form").send({
    fullName: name,
    email,
    username: `qa${stamp}`,
    department: "QA",
    designation: "Analyst",
    joiningDate: "2026-08-01",
    phone: "9876500001",
  });
  expect(res.status).toBe(201);
  expect(res.body.data.inviteUrl).toMatch(/\/invite\//);
  expect(res.body.data.tempPassword).toBeUndefined();
  return { id: res.body.data.id as string, email, inviteUrl: res.body.data.inviteUrl as string };
}

async function activateEmployee(session: ReturnType<typeof agent>, inviteUrl: string, password: string) {
  const token = inviteUrl.split("/invite/")[1];
  const res = await session.post("/api/auth/activate").type("form").send({
    token,
    password,
    confirmPassword: password,
  });
  expect(res.status).toBe(200);
}

async function changePassword(session: ReturnType<typeof agent>, current: string, next: string) {
  const res = await session.post("/api/auth/change-password").type("form").send({
    currentPassword: current,
    newPassword: next,
    confirmPassword: next,
  });
  expect(res.status).toBe(200);
}

async function completeKyc(
  session: ReturnType<typeof agent>,
  opts: {
    fullName: string;
    pan: string;
    account: string;
  },
) {
  const saved = await session.patch("/api/employee/kyc").type("form").send({
    fullName: opts.fullName,
    dateOfBirth: "1996-04-12",
    gender: "FEMALE",
    phone: "9876500123",
    address: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pinCode: "560001",
    emergencyName: "Parent",
    emergencyPhone: "9876500999",
    pan: opts.pan,
    govIdType: "AADHAAR",
    govIdNumber: "234512345678",
    accountHolderName: opts.fullName,
    bankName: "HDFC Bank",
    accountNumber: opts.account,
    ifsc: "HDFC0001234",
    upiId: "qa@hdfc",
  });
  expect(saved.status).toBe(200);

  for (const category of ["ID", "PAN"] as const) {
    const upload = await session
      .post("/api/employee/kyc/documents")
      .field("category", category)
      .field("title", category === "ID" ? "Identity document" : "PAN document")
      .attach("file", PDF, { filename: `${category.toLowerCase()}.pdf`, contentType: "application/pdf" });
    expect(upload.status).toBe(200);
  }

  const submitted = await session.post("/api/employee/kyc/submit");
  expect(submitted.status).toBe(200);
  expect(submitted.body.data.kycStatus).toBe("PENDING_VERIFICATION");
}

describe("DropZen API", () => {
  const admin = agent();
  const alice = agent();
  const bob = agent();
  let aliceId = "";
  let bobId = "";
  let aliceEmail = "";
  let bobEmail = "";
  let aliceInvite = "";
  let assignmentId = "";
  let submissionId = "";
  let taskId = "";
  let leaveId = "";
  let aliceDocId = "";

  beforeAll(async () => {
    await prisma.$connect();
  });

  it("GET /api/health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toBe("connected");
  });

  it("rejects invalid login", async () => {
    const res = await request(app).post("/api/auth/login").type("form").send({
      identifier: "nobody@dropzen.com",
      password: "WrongPass1",
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("admin login", async () => {
    const res = await login(admin, "admin@dropzen.com", "Admin@1234");
    expect(res.body.data.user.role).toBe("ADMIN");
  });

  it("admin can create an employee with NOT_STARTED verification", async () => {
    const created = await createEmployee(admin, `${Date.now()}a`, "QA Alice");
    aliceId = created.id;
    aliceEmail = created.email;
    const row = await prisma.employee.findUnique({ where: { id: aliceId }, include: { user: true } });
    expect(row?.kycStatus).toBe("NOT_STARTED");
    expect(row?.user.status).toBe("INVITED");
    const salaries = await prisma.salaryRecord.count({ where: { employeeId: aliceId } });
    expect(salaries).toBe(0);
    const balances = await prisma.leaveBalance.count({ where: { employeeId: aliceId } });
    expect(balances).toBe(0);
    aliceInvite = created.inviteUrl;
  });

  it("unapproved employee is blocked from the dashboard", async () => {
    await activateEmployee(alice, aliceInvite, "Employee@456");
    const dash = await alice.get("/api/employee/dashboard");
    expect(dash.status).toBe(403);
    expect(dash.body.code).toBe("KYC_REQUIRED");
    const salary = await alice.get("/api/employee/salary");
    expect(salary.status).toBe(403);
    expect(salary.body.code).toBe("KYC_REQUIRED");
  });

  it("employee verification submit + admin approve unlocks the workspace", async () => {
    await completeKyc(alice, { fullName: "QA Alice", pan: "ABCDE1234F", account: "50123400998877" });
    const locked = await alice.patch("/api/employee/kyc").type("form").send({ city: "Mysuru" });
    expect(locked.status).toBe(403);

    const missingReason = await admin.post(`/api/admin/kyc/${aliceId}/correction`).type("form").send({ reason: "" });
    expect(missingReason.status).toBe(400);

    const correction = await admin.post(`/api/admin/kyc/${aliceId}/correction`).type("form").send({
      reason: "Please correct the city spelling.",
    });
    expect(correction.status).toBe(200);
    expect(correction.body.data.kycStatus).toBe("INCOMPLETE");

    const edited = await alice.patch("/api/employee/kyc").type("form").send({ city: "Bengaluru" });
    expect(edited.status).toBe(200);
    const resubmit = await alice.post("/api/employee/kyc/submit");
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.data.kycStatus).toBe("PENDING_VERIFICATION");

    const approve = await admin.post(`/api/admin/kyc/${aliceId}/approve`);
    expect(approve.status).toBe(200);
    const balances = await prisma.leaveBalance.count({ where: { employeeId: aliceId } });
    expect(balances).toBeGreaterThan(0);
    const dash = await alice.get("/api/employee/dashboard");
    expect(dash.status).toBe(200);
    expect(dash.body.data.salary).toBeNull();
    expect(dash.body.data.todayTasks).toEqual([]);
    const adminEmp = await admin.get(`/api/admin/employees/${aliceId}`);
    expect(JSON.stringify(adminEmp.body)).not.toMatch(
      /panEnc|govIdNumberEnc|accountNumberEnc|passwordHash|storageKey|tokenHash/,
    );
  });

  it("admin dashboard aggregates from the database", async () => {
    const res = await admin.get("/api/admin/dashboard");
    expect(res.status).toBe(200);
    expect(typeof res.body.data.employees).toBe("number");
    expect(typeof res.body.data.pendingKyc).toBe("number");
  });

  it("employee cannot list employees or audit logs", async () => {
    expect((await alice.get("/api/admin/employees")).status).toBe(403);
    expect((await alice.get("/api/admin/audit")).status).toBe(403);
  });

  it("creates a second employee for isolation tests", async () => {
    const created = await createEmployee(admin, `${Date.now()}b`, "QA Bob");
    bobId = created.id;
    bobEmail = created.email;
    await activateEmployee(bob, created.inviteUrl, "Employee@789");
    await completeKyc(bob, { fullName: "QA Bob", pan: "XYZAB5678C", account: "50123400990011" });
    expect((await admin.post(`/api/admin/kyc/${bobId}/approve`)).status).toBe(200);
  });

  it("employee isolation: cannot fetch another employee admin record", async () => {
    const res = await alice.get(`/api/admin/employees/${bobId}`);
    expect(res.status).toBe(403);
  });

  it("bank details stay private between employees", async () => {
    const own = await alice.get("/api/employee/bank");
    expect(own.status).toBe(200);
    expect(own.body.data?.accountNumber).toBeUndefined();
    expect(JSON.stringify(own.body)).not.toMatch(/50123400998877/);

    const stolen = await bob.get(`/api/admin/bank/${aliceId}?reveal=1`);
    expect(stolen.status).toBe(403);
  });

  it("salary alias is empty until admin creates a record", async () => {
    const res = await alice.get("/api/employee/salary");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("unread notification count comes from the database", async () => {
    const res = await alice.get("/api/notifications/unread-count");
    expect(res.status).toBe(200);
    expect(typeof res.body.data.count).toBe("number");
  });

  it("attendance check-in and duplicate prevention", async () => {
    const first = await alice.post("/api/attendance/check-in");
    if (first.status === 200 || first.status === 409 || first.status === 400) {
      const second = await alice.post("/api/attendance/check-in");
      expect([400, 409]).toContain(second.status);
    } else {
      expect(first.status).toBeLessThan(500);
    }
  });

  it("task create, assign, submit, revision, approve", async () => {
    const created = await admin
      .post("/api/admin/tasks")
      .field("title", "QA excel task")
      .field("description", "Enrich the assigned rows")
      .field("instructions", "Fill the template and submit.")
      .field("dateKey", "2026-08-20")
      .field("deadline", "2026-08-21T18:30:00.000Z")
      .field("priority", "HIGH")
      .field("employeeIds", aliceId);
    expect(created.status).toBe(201);
    taskId = created.body.data.id;

    const mine = await alice.get(`/api/employee/tasks/${taskId}`);
    expect(mine.status).toBe(200);
    assignmentId = mine.body.data.id;

    const other = await bob.get(`/api/employee/tasks/${taskId}`);
    expect([403, 404]).toContain(other.status);

    const xlsx = Buffer.from("PK\u0003\u0004fake-xlsx-content");
    const submitted = await alice
      .post(`/api/employee/assignments/${assignmentId}/submit`)
      .field("comments", "First pass")
      .attach("file", xlsx, {
        filename: "work.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    expect(submitted.status).toBe(200);

    const subs = await admin.get("/api/admin/submissions");
    expect(subs.status).toBe(200);
    const mineSub = subs.body.data.find(
      (s: { assignment: { employeeId: string } }) => s.assignment.employeeId === aliceId,
    );
    submissionId = mineSub.id;

    const revision = await admin.post(`/api/admin/submissions/${submissionId}/revision`).type("form").send({
      feedback: "Please fix row 2",
    });
    expect(revision.status).toBe(200);

    const resubmit = await alice
      .post(`/api/employee/assignments/${assignmentId}/submit`)
      .field("comments", "Revised")
      .attach("file", xlsx, {
        filename: "work-v2.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    expect(resubmit.status).toBe(200);

    const approve = await admin.post(`/api/admin/submissions/${submissionId}/approve`).type("form").send({
      feedback: "Looks good",
    });
    expect(approve.status).toBe(200);
  });

  it("leave request and admin approval", async () => {
    const types = await prisma.leaveType.findFirst({ where: { active: true } });
    const applied = await alice.post("/api/leave").type("form").send({
      leaveTypeId: types!.id,
      startDate: "2026-09-14",
      endDate: "2026-09-14",
      reason: "Family appointment",
    });
    expect([200, 409]).toContain(applied.status);
    const mine = await alice.get("/api/leave");
    const pending = mine.body.data.requests.find((r: { status: string }) => r.status === "PENDING");
    if (pending) {
      leaveId = pending.id;
      const approved = await admin.post(`/api/admin/leave/${leaveId}/approve`);
      expect(approved.status).toBe(200);
    }
  });

  it("document authorization", async () => {
    const docs = await prisma.document.findFirst({ where: { employeeId: aliceId } });
    expect(docs).toBeTruthy();
    aliceDocId = docs!.id;
    const allowed = await alice.get(`/api/documents/${aliceDocId}/download`);
    expect(allowed.status).toBe(200);
    const denied = await bob.get(`/api/documents/${aliceDocId}/download`);
    expect(denied.status).toBe(403);
    const fileDenied = await bob.get(`/api/files/${docs!.fileId}`);
    expect([403, 404]).toContain(fileDenied.status);
    expect((await bob.get(`/api/admin/employees/${aliceId}`)).status).toBe(403);
    expect((await bob.get(`/api/admin/payroll?q=${encodeURIComponent(aliceEmail)}`)).status).toBe(403);
  });

  it("payroll is scoped to the signed-in employee", async () => {
    const created = await admin.post("/api/admin/payroll").type("form").send({
      employeeId: aliceId,
      month: "8",
      year: "2026",
      amount: "41000",
      status: "PAID",
    });
    expect([200, 201]).toContain(created.status);
    const res = await alice.get("/api/employee/salary");
    expect(res.status).toBe(200);
    expect(res.body.data.every((row: { employeeId: string }) => row.employeeId === aliceId)).toBe(true);
    const bobPay = await bob.get("/api/employee/salary");
    expect(bobPay.body.data.every((row: { employeeId: string }) => row.employeeId !== aliceId)).toBe(true);
  });

  it("notifications exist after workflow", async () => {
    const res = await alice.get("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
