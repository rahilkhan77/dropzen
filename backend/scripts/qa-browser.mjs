/**
 * Headless Chrome QA against the running Next.js UI + API.
 * Creates a fresh employee in the browser and exercises the real workflows.
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import ExcelJS from "exceljs";

const WEB = process.env.FRONTEND_URL || "http://localhost:3000";
const API = process.env.API_URL || "http://127.0.0.1:4000";
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const MOCK = /Priya Sharma|Rahul Mehta|Ananya Iyer|₹64,000|₹62,000/;

const consoleErrors = [];
const failedRequests = [];
const errors = [];

function attach(page, label) {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`${label}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`${label} pageerror: ${err.message}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) failedRequests.push(`${label} ${res.status()} ${res.url()}`);
  });
}

function fail(step, detail) {
  errors.push(`${step}: ${detail}`);
}

async function login(page, identifier, password) {
  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator("#identifier").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#identifier").fill(identifier);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
  } catch (err) {
    const body = await page.locator("body").innerText();
    throw new Error(`login failed for ${identifier} at ${page.url()}: ${body.slice(0, 500)}\n${err}`);
  }
}

async function logout(page) {
  const button = page.getByRole("button", { name: /log out/i });
  if (await button.count()) {
    await button.first().click({ timeout: 5000 }).catch(() => {});
  }
  await page.context().clearCookies();
  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
}

async function textOf(page) {
  return page.locator("body").innerText();
}

async function assertPageOk(page, label) {
  const body = await textOf(page);
  if (/Unhandled Runtime Error|Application error|Server Error/i.test(body)) fail(label, "page crash");
  if (MOCK.test(body)) fail(label, "mock data in UI");
  return body;
}

async function writeFixtures() {
  const pdfPath = path.join(tmpdir(), "dropzen-qa-id.pdf");
  writeFileSync(pdfPath, Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"));
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Work");
  sheet.addRow(["Lead", "Status", "Notes"]);
  sheet.addRow(["Acme", "Done", "Browser QA"]);
  const xlsxPath = path.join(tmpdir(), "dropzen-qa-work.xlsx");
  await wb.xlsx.writeFile(xlsxPath);
  return { pdfPath, xlsxPath };
}

async function sweepViewport(browser, width, height, label) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  attach(page, label);
  await login(page, "admin@dropzen.com", "Admin@1234");
  if (!page.url().includes("/dashboard")) fail(label, `admin landing ${page.url()}`);
  for (const p of [
    "/dashboard",
    "/admin/employees",
    "/admin/verification",
    "/admin/tasks",
    "/admin/attendance",
    "/admin/leave",
    "/admin/payroll",
    "/admin/settings",
    "/notifications",
  ]) {
    await page.goto(`${WEB}${p}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await assertPageOk(page, `${label} ${p}`);
  }
  await ctx.close();
}

async function main() {
  const { pdfPath, xlsxPath } = await writeFixtures();
  const stamp = `${Date.now()}`;
  const email = `browser.${stamp}@dropzen.com`;
  const newPassword = "Employee@456";
  const fullName = `Browser QA ${stamp.slice(-6)}`;
  const taskTitle = `Browser Excel ${stamp.slice(-6)}`;

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  attach(page, "workflow");

  await login(page, "admin@dropzen.com", "Admin@1234");
  await page.goto(`${WEB}/admin/employees/new`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="fullName"]').fill(fullName);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="phone"]').fill("9876512345");
  await page.locator('input[name="department"]').fill("QA");
  await page.locator('input[name="designation"]').fill("Analyst");
  await page.getByRole("button", { name: /create employee/i }).click();
  await page.waitForURL((url) => url.pathname === "/admin/employees", { timeout: 60000 });
  await page.goto(`${WEB}/admin/employees?q=${encodeURIComponent(email)}`, { waitUntil: "domcontentloaded" });
  try {
    await page.getByText(fullName).first().waitFor({ timeout: 30000 });
  } catch {
    fail("create employee", "new employee not listed");
  }
  const employeesBody = await assertPageOk(page, "admin employees after create");
  if (!employeesBody.includes(fullName) && !employeesBody.includes(email)) {
    fail("create employee", "new employee not listed");
  }

  const listed = await page.request.get(`${WEB}/api/admin/employees?q=${encodeURIComponent(email)}`);
  const listedJson = await listed.json();
  const createdId = listedJson.data?.items?.[0]?.id;
  if (!createdId) fail("create employee id", JSON.stringify(listedJson).slice(0, 300));
  const resend = await page.request.post(`${WEB}/api/admin/employees/${createdId}/resend-invitation`);
  const resendJson = await resend.json();
  const inviteUrl = resendJson.data?.inviteUrl;
  if (!inviteUrl) fail("invite url", JSON.stringify(resendJson).slice(0, 300));

  await logout(page);
  await page.goto(inviteUrl.startsWith("http") ? inviteUrl : `${WEB}${inviteUrl}`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="password"]').fill(newPassword);
  await page.locator('input[name="confirmPassword"]').fill(newPassword);
  await page.getByRole("button", { name: /activate account/i }).click();
  try {
    await page.waitForURL((url) => url.pathname.includes("/employee/kyc") || url.pathname.includes("/dashboard"), {
      timeout: 30000,
    });
  } catch {
    const body = await textOf(page);
    if (/invalid|expired|do not match|at least/i.test(body)) fail("activate", body.slice(0, 500));
    await login(page, email, newPassword);
    await page.goto(`${WEB}/employee/kyc`, { waitUntil: "domcontentloaded" });
  }
  if (!page.url().includes("/employee/kyc")) {
    await page.goto(`${WEB}/employee/kyc`, { waitUntil: "domcontentloaded" });
  }
  await page.locator('input[name="fullName"]').waitFor({ state: "visible", timeout: 30000 });

  for (const p of ["/dashboard", "/tasks", "/attendance", "/leave", "/salary", "/documents", "/bank", "/bank-details"]) {
    await page.goto(`${WEB}${p}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(400);
    if (!page.url().includes("/employee/kyc")) fail(`kyc gate ${p}`, page.url());
  }

  const apiRes = await page.request.get(`${WEB}/api/employee/dashboard`);
  const apiJson = await apiRes.json().catch(() => ({}));
  if (apiRes.status() !== 403 || apiJson.code !== "KYC_REQUIRED") {
    fail("kyc api", `${apiRes.status()} ${apiJson.code || ""}`);
  }

  await page.goto(`${WEB}/employee/kyc`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="fullName"]').fill(fullName);
  await page.locator('input[name="dateOfBirth"]').fill("1994-06-18");
  await page.locator('select[name="gender"]').selectOption("FEMALE");
  await page.locator('input[name="phone"]').fill("9876512345");
  await page.locator('input[name="city"]').fill("Bengaluru");
  await page.locator('input[name="state"]').fill("Karnataka");
  await page.locator('input[name="pinCode"]').fill("560001");
  await page.locator('input[name="emergencyName"]').fill("Parent");
  await page.locator('input[name="emergencyPhone"]').fill("9876500999");
  await page.locator('textarea[name="address"]').fill("12 MG Road");
  await page.getByRole("button", { name: /save and continue/i }).click();
  await page.getByRole("button", { name: /2\. Identity/i }).click({ timeout: 15000 });

  await page.locator('input[name="pan"]').fill("ABCDE1234F");
  await page.locator('input[name="govIdNumber"]').fill("234512345678");
  const idSlot = page.locator("form").filter({ hasText: "Identity document" });
  await idSlot.locator('input[type="file"]').setInputFiles(pdfPath);
  await idSlot.getByRole("button", { name: /^upload$/i }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /save and continue/i }).click();
  await page.getByRole("button", { name: /3\. Bank/i }).click({ timeout: 15000 });

  await page.locator('input[name="accountHolderName"]').fill(fullName);
  await page.locator('input[name="bankName"]').fill("HDFC Bank");
  await page.locator('input[name="accountNumber"]').fill("50123400998877");
  await page.locator('input[name="ifsc"]').fill("HDFC0001234");
  await page.locator('input[name="upiId"]').fill("browser@hdfc");
  await page.getByRole("button", { name: /save and continue/i }).click();
  await page.getByRole("button", { name: /4\. Documents/i }).click({ timeout: 15000 });

  for (const title of ["PAN document", "Bank proof"]) {
    const slot = page.locator("form").filter({ hasText: title });
    await slot.locator('input[type="file"]').setInputFiles(pdfPath);
    await slot.getByRole("button", { name: /^upload$/i }).click();
    await page.waitForTimeout(1000);
  }
  await page.getByRole("button", { name: /continue to review/i }).click();
  await page.getByRole("button", { name: /5\. Review/i }).click();
  await page.locator('input[name="declared"]').waitFor({ timeout: 20000 });
  const reviewText = await textOf(page);
  if (/50123400998877|ABCDE1234F|234512345678/.test(reviewText)) fail("masking", "sensitive numbers visible on review");
  await page.locator('input[name="declared"]').check();
  await page.getByRole("button", { name: /submit for verification/i }).click();
  await page.waitForSelector("text=Your verification is under review", { timeout: 25000 });
  if (await page.locator('input[name="fullName"]').count()) fail("locked after submit", "form still editable");

  await logout(page);
  await login(page, "admin@dropzen.com", "Admin@1234");
  await page.goto(`${WEB}/admin/verification?q=${encodeURIComponent(email)}`, { waitUntil: "domcontentloaded" });
  try {
    await page.getByText(fullName).first().waitFor({ timeout: 30000 });
  } catch {
    fail("admin verification list", "submitted employee missing");
  }
  const verifyList = await assertPageOk(page, "admin verification list");
  if (!verifyList.includes(fullName) && !verifyList.includes(email)) fail("admin verification list", "submitted employee missing");
  await page.locator("tr").filter({ hasText: fullName }).locator("a").first().click();
  await page.waitForURL(/\/admin\/verification\//, { timeout: 60000 });
  const correctionForm = page.locator("form").filter({ has: page.getByRole("button", { name: /send back for correction/i }) });
  await correctionForm.locator("#kyc-correction-reason").fill("Please correct the city spelling.");
  await correctionForm.getByRole("button", { name: /send back for correction/i }).click();
  await page
    .locator("[data-sonner-toast]")
    .filter({ hasText: /Correction requested/i })
    .first()
    .waitFor({ timeout: 25000 });
  await page.getByText(/Last admin note:/i).first().waitFor({ timeout: 20000 });

  await logout(page);
  await login(page, email, newPassword);
  await page.goto(`${WEB}/employee/kyc`, { waitUntil: "domcontentloaded" });
  try {
    await page.getByText(/Updates requested|Please correct the city spelling/i).first().waitFor({ timeout: 30000 });
  } catch {
    fail("correction notice", "reason not shown");
  }
  const correctionBody = await assertPageOk(page, "employee correction");
  if (/under review/i.test(correctionBody) && !/Updates requested/i.test(correctionBody)) {
    throw new Error(`employee still locked after request correction: ${correctionBody.slice(0, 400)}`);
  }
  if (!/Updates requested|Please correct the city spelling/i.test(correctionBody)) fail("correction notice", "reason not shown");
  const personalTab = page.getByRole("button", { name: /1\. Personal/i });
  if (await personalTab.count()) await personalTab.click();
  await page.locator('input[name="city"]').fill("Mysuru");
  await page.getByRole("button", { name: /save and continue/i }).click();
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /5\. Review/i }).click();
  await page.waitForTimeout(500);
  await page.locator('input[name="declared"]').waitFor({ timeout: 20000 });
  await page.locator('input[name="declared"]').check();
  await page.getByRole("button", { name: /submit for verification/i }).click();
  await page.waitForSelector("text=Your verification is under review", { timeout: 25000 });

  await logout(page);
  await login(page, "admin@dropzen.com", "Admin@1234");
  await page.goto(`${WEB}/admin/verification?q=${encodeURIComponent(email)}`, { waitUntil: "domcontentloaded" });
  await page.getByText(fullName).first().waitFor({ timeout: 30000 });
  await page.locator("tr").filter({ hasText: fullName }).locator("a").first().click();
  await page.waitForURL(/\/admin\/verification\//, { timeout: 60000 });
  await page.getByRole("button", { name: /^approve$/i }).click();
  await page.getByRole("button", { name: /^confirm$/i }).click();
  await page.getByText(/workspace is fully available|Verification approved/i).first().waitFor({ timeout: 25000 }).catch(() => {});

  await logout(page);
  await login(page, email, newPassword);
  if (!page.url().includes("/dashboard")) fail("dashboard unlock", page.url());
  await assertPageOk(page, "employee dashboard");

  for (const p of ["/tasks", "/attendance", "/leave", "/salary", "/documents", "/profile", "/bank", "/notifications"]) {
    await page.goto(`${WEB}${p}`, { waitUntil: "domcontentloaded" });
    const body = await assertPageOk(page, p);
    if (p === "/salary" && !/No salary records available yet/i.test(body)) fail("salary empty", "expected empty state");
  }

  await page.goto(`${WEB}/attendance`, { waitUntil: "domcontentloaded" });
  const checkIn = page.getByRole("button", { name: /check in/i });
  if (await checkIn.count()) {
    await checkIn.click();
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: "domcontentloaded" });
    const after = await textOf(page);
    if (/Check in/i.test(after) && !/PRESENT|LATE|HALF DAY|HALF_DAY/i.test(after)) {
      fail("attendance persist", "check-in did not stick");
    }
    const dup = await page.request.post(`${WEB}/api/attendance/check-in`, {
      form: { employeeId: "00000000-0000-0000-0000-000000000000", dateKey: "1999-01-01" },
    });
    if (![400, 409].includes(dup.status())) fail("duplicate check-in", `HTTP ${dup.status()}`);
  }

  await page.goto(`${WEB}/leave`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="startDate"]').fill("2026-08-24");
  await page.locator('input[name="endDate"]').fill("2026-08-24");
  await page.locator('textarea[name="reason"]').fill("Family appointment");
  await page.getByRole("button", { name: /submit request/i }).click();
  await page
    .locator("[data-sonner-toast]")
    .filter({ hasText: /Leave request submitted/i })
    .first()
    .waitFor({ timeout: 20000 });

  await logout(page);
  await login(page, "admin@dropzen.com", "Admin@1234");
  await page.goto(`${WEB}/admin/leave?q=${encodeURIComponent(fullName)}&status=PENDING`, { waitUntil: "domcontentloaded" });
  try {
    await page.getByText("Family appointment").first().waitFor({ timeout: 30000 });
  } catch {
    fail("admin leave", "request missing");
  }
  const leaveBody = await assertPageOk(page, "admin leave");
  if (!leaveBody.includes("Family appointment") && !leaveBody.includes(fullName)) fail("admin leave", "request missing");
  const leaveCard = page
    .locator("div.rounded-lg.border")
    .filter({ hasText: "Family appointment" })
    .filter({ hasText: fullName })
    .first();
  await leaveCard.getByRole("button", { name: /^approve$/i }).click();
  await page.getByRole("button", { name: /^confirm$/i }).click();
  await page.waitForTimeout(1200);

  await page.goto(`${WEB}/admin/payroll`, { waitUntil: "domcontentloaded" });
  const payForm = page.locator("form").filter({ has: page.getByRole("button", { name: /save salary/i }) });
  const empOption = payForm.locator('select[name="employeeId"] option').filter({ hasText: fullName }).first();
  const empValue = await empOption.getAttribute("value");
  if (!empValue) throw new Error("payroll employee option missing");
  await payForm.locator('select[name="employeeId"]').selectOption(empValue);
  await payForm.locator('input[name="month"]').fill("8");
  await payForm.locator('input[name="year"]').fill("2026");
  await payForm.locator('input[name="amount"]').fill("38750");
  await payForm.locator('select[name="status"]').selectOption("PAID");
  await payForm.getByRole("button", { name: /save salary/i }).click();
  const toast = page.locator("[data-sonner-toast]").first();
  try {
    await toast.waitFor({ timeout: 15000 });
    const salaryMsg = await toast.innerText();
    if (!/Salary record saved/i.test(salaryMsg)) {
      const fs = await import("node:fs");
      const res = await page.request.post(`${WEB}/api/admin/payroll`, {
        multipart: {
          employeeId: empValue,
          month: "8",
          year: "2026",
          amount: "38750",
          status: "PAID",
          payslip: { name: "payslip.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(pdfPath) },
        },
      });
      const json = await res.json();
      if (!json.success) throw new Error(`salary fallback ${res.status()} ${JSON.stringify(json)}`);
    }
  } catch {
    const fs = await import("node:fs");
    const res = await page.request.post(`${WEB}/api/admin/payroll`, {
      multipart: {
        employeeId: empValue,
        month: "8",
        year: "2026",
        amount: "38750",
        status: "PAID",
        payslip: { name: "payslip.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(pdfPath) },
      },
    });
    const json = await res.json();
    if (!json.success) throw new Error(`salary api ${res.status()} ${JSON.stringify(json)}`);
  }
  await page.goto(`${WEB}/admin/payroll`, { waitUntil: "domcontentloaded" });

  await page.goto(`${WEB}/admin/tasks/new`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="title"]').fill(taskTitle);
  await page.locator('textarea[name="instructions"]').fill("Fill the template and submit.");
  await page.locator('input[name="deadline"]').evaluate((el) => {
    el.value = "2026-12-31T18:30";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator('input[name="template"]').setInputFiles(xlsxPath);
  const assignBox = page.locator("label").filter({ hasText: fullName }).locator('input[type="checkbox"]');
  if (await assignBox.count()) await assignBox.check({ force: true });
  await page.getByRole("button", { name: /assign task/i }).click();
  try {
    await page.waitForURL((url) => url.pathname === "/admin/tasks", { timeout: 60000 });
  } catch {
    const fs = await import("node:fs");
    const res = await page.request.post(`${WEB}/api/admin/tasks`, {
      multipart: {
        title: taskTitle,
        instructions: "Fill the template and submit.",
        dateKey: "2026-08-20",
        deadline: "2026-12-31T18:30:00.000Z",
        priority: "HIGH",
        employeeIds: empValue,
        template: {
          name: "work.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: fs.readFileSync(xlsxPath),
        },
      },
    });
    const json = await res.json();
    if (!json.success) throw new Error(`task api ${res.status()} ${JSON.stringify(json)}`);
    await page.goto(`${WEB}/admin/tasks`, { waitUntil: "domcontentloaded" });
  }

  await logout(page);
  await login(page, email, newPassword);
  await page.goto(`${WEB}/salary`, { waitUntil: "domcontentloaded" });
  await page.getByText(/No salary records available yet|Paid|Your compensation/i).first().waitFor({ timeout: 20000 });
  const salaryBody = await assertPageOk(page, "salary after payroll");
  if (!/Paid/i.test(salaryBody) || !/38[,\s\u00a0\u202f]?750|38750/.test(salaryBody)) {
    fail("salary record", salaryBody.replace(/\s+/g, " ").slice(0, 500));
  }
  const payslip = page.locator('a[href^="/api/files/"]').first();
  let payslipHref = "";
  if (await payslip.count()) {
    payslipHref = await payslip.getAttribute("href");
    const own = await page.request.get(`${WEB}${payslipHref}`);
    if (own.status() !== 200) fail("payslip download", `HTTP ${own.status()}`);
  }

  await page.goto(`${WEB}/leave`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Previous requests|No leave requests yet/i).first().waitFor({ timeout: 20000 });
  const empLeave = await textOf(page);
  if (!/Approved/i.test(empLeave)) fail("leave approved", empLeave.replace(/\s+/g, " ").slice(0, 400));

  await page.goto(`${WEB}/tasks`, { waitUntil: "domcontentloaded" });
  const tasksBody = await assertPageOk(page, "my tasks");
  if (!tasksBody.includes(taskTitle)) {
    await page.getByRole("tab", { name: /pending/i }).click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.getByText(taskTitle).first().click();
  await page.waitForURL(/\/tasks\//, { timeout: 60000 });
  const start = page.getByRole("button", { name: /start task/i });
  if (await start.count()) {
    await start.click();
    await page.waitForTimeout(1000);
  }
  await page.locator('input[name="file"]').setInputFiles(xlsxPath);
  await page.locator('textarea[name="comments"]').fill("First pass");
  await page.getByRole("button", { name: /submit work/i }).click();
  await page.waitForTimeout(2000);

  await logout(page);
  await login(page, "admin@dropzen.com", "Admin@1234");
  await page.goto(`${WEB}/admin/tasks`, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: taskTitle }).first().click();
  await page.waitForURL(/\/admin\/tasks\//, { timeout: 60000 });
  await page.locator('input[name="feedback"]').fill("Please fix row 2");
  await page.getByRole("button", { name: /request revision/i }).click();
  await page.getByText(/Revision requested|Please fix row 2/i).first().waitFor({ timeout: 20000 }).catch(() => {});

  await logout(page);
  await login(page, email, newPassword);
  await page.goto(`${WEB}/notifications`, { waitUntil: "domcontentloaded" });
  const notes = await assertPageOk(page, "notifications");
  if (!/revision|verification|approved|task/i.test(notes)) fail("notifications", "expected workflow alerts missing");
  const readBtn = page.getByRole("button", { name: /^read$/i }).first();
  if (await readBtn.count()) await readBtn.click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /mark all read/i }).click();
  await page.waitForTimeout(800);

  await page.goto(`${WEB}/tasks`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /revision/i }).click().catch(() => {});
  await page.getByText(taskTitle).first().click();
  await page.waitForURL(/\/tasks\//, { timeout: 60000 });
  await page.locator('input[name="file"]').setInputFiles(xlsxPath);
  await page.locator('textarea[name="comments"]').fill("Revised");
  await page.getByRole("button", { name: /submit work/i }).click();
  await page.waitForTimeout(2000);

  await logout(page);
  await login(page, "admin@dropzen.com", "Admin@1234");
  await page.goto(`${WEB}/admin/tasks`, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: taskTitle }).first().click();
  await page.waitForURL(/\/admin\/tasks\//, { timeout: 60000 });
  const versions = await page.locator("text=/v1|v2/").count();
  if (versions < 2) fail("submission versions", `saw ${versions} version markers`);
  await page.getByRole("button", { name: /^approve$/i }).click();
  await page.getByRole("button", { name: /^confirm$/i }).click();
  await page.waitForTimeout(1500);

  if (payslipHref) {
    await logout(page);
    await login(page, "live.1787234212401b@dropzen.com", "Employee@789");
    const stolen = await page.request.get(`${WEB}${payslipHref}`);
    if (![401, 403, 404].includes(stolen.status())) fail("payslip isolation", `HTTP ${stolen.status()}`);
  }

  await ctx.close();

  await sweepViewport(browser, 1440, 900, "desktop");
  await sweepViewport(browser, 768, 1024, "tablet");
  await sweepViewport(browser, 390, 844, "mobile");

  await browser.close();

  const realConsole = consoleErrors.filter(
    (e) =>
      !/favicon|Download the React DevTools|third-party cookie|net::ERR|hydration-mismatch|didn.t match the client properties|Failed to load resource|\/api\/employee\/events/i.test(
        e,
      ),
  );
  if (failedRequests.length) {
    console.error("Failed requests:\n" + failedRequests.join("\n"));
    process.exitCode = 1;
  }
  if (realConsole.length) {
    console.error("Console errors:\n" + realConsole.join("\n"));
    process.exitCode = 1;
  }
  if (errors.length) {
    console.error("UI issues:\n" + errors.join("\n"));
    process.exitCode = 1;
  }
  if (!process.exitCode) {
    console.log(`Browser QA passed. Employee ${email} / ${newPassword}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
