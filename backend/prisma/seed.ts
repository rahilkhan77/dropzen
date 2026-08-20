import path from "path";
import { readFileSync, existsSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  const rootEnv = path.join(process.cwd(), "..", ".env");
  for (const candidate of [envPath, rootEnv]) {
    if (!existsSync(candidate)) continue;
    for (const line of readFileSync(candidate, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

const prisma = new PrismaClient();

async function main() {
  await prisma.companySettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", companyName: "DropZen", legalName: "DropZen Technologies", nextEmployeeSeq: 1001 },
  });

  await prisma.roleRecord.upsert({
    where: { code: "ADMIN" },
    update: { name: "Administrator" },
    create: { code: "ADMIN", name: "Administrator" },
  });
  await prisma.roleRecord.upsert({
    where: { code: "EMPLOYEE" },
    update: { name: "Employee" },
    create: { code: "EMPLOYEE", name: "Employee" },
  });

  for (const type of [
    { name: "Casual Leave", daysPerYear: 12 },
    { name: "Sick Leave", daysPerYear: 10 },
    { name: "Earned Leave", daysPerYear: 15 },
  ]) {
    await prisma.leaveType.upsert({
      where: { name: type.name },
      update: { daysPerYear: type.daysPerYear, paid: true, active: true },
      create: { ...type, paid: true, active: true },
    });
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email: "admin@dropzen.com" } });
  if (!existingAdmin) {
    const adminHash = await hash("Admin@1234", 12);
    await prisma.user.create({
      data: {
        email: "admin@dropzen.com",
        username: "admin",
        passwordHash: adminHash,
        role: "ADMIN",
        mustChangePassword: true,
      },
    });
    console.log("Seed complete. Bootstrap admin created (must change password on first login).");
  } else {
    console.log("Seed complete. Bootstrap admin already exists (password not modified).");
  }
  console.log("No demo employees, salary, attendance, or tasks were created.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
