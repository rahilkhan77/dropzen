import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username"),
  password: z.string().min(1, "Enter your password"),
});

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[0-9]/, "Include a number");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const activateSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const employeeCreateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  username: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[a-z0-9._-]+$/i, "Use letters, numbers, dots, or dashes")
      .optional(),
  ),
  phone: z.string().trim().min(8, "Phone is required").max(20),
  department: z.string().trim().min(1),
  designation: z.string().trim().min(1),
  joiningDate: z.string().min(1),
  employeeCode: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .min(3)
      .max(20)
      .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers, or dashes")
      .optional(),
  ),
  dateOfBirth: z.string().optional(),
  address: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  baseSalary: z.coerce.number().int().nonnegative().optional(),
});

export const employeeUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().optional().nullable(),
  department: z.string().trim().optional(),
  designation: z.string().trim().optional(),
  joiningDate: z.string().optional(),
  skills: z.string().optional(),
  dateOfBirth: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  emergencyName: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  baseSalary: z.coerce.number().int().nonnegative().optional().nullable(),
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional(),
  dateOfBirth: z.string().optional(),
  address: z.string().trim().max(500).optional(),
  emergencyName: z.string().trim().max(120).optional(),
  emergencyPhone: z.string().trim().max(20).optional(),
  skills: z.string().optional(),
});

export const bankSchema = z.object({
  accountHolderName: z.string().trim().min(2).max(120),
  bankName: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().min(6).max(24).regex(/^[0-9]+$/, "Account number must be numeric"),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC must look like HDFC0001234"),
  upiId: z.string().trim().max(80).optional(),
  pan: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN must look like ABCDE1234F")
      .optional(),
  ),
  otherInfo: z.string().trim().max(500).optional(),
});

export const leaveSchema = z.object({
  leaveTypeId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});

export const taskSchema = z.object({
  title: z.string().trim().min(3).max(160),
  instructions: z.string().trim().min(3),
  description: z.string().trim().optional(),
  dateKey: z.string().min(1),
  deadline: z.string().min(1),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  estimatedHours: z.string().optional(),
  notes: z.string().optional(),
  employeeIds: z.array(z.string()).min(1, "Assign at least one employee"),
  recurring: z.boolean().optional(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional(),
});

export const salarySchema = z.object({
  employeeId: z.string().min(1),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  amount: z.coerce.number().int().nonnegative().optional(),
  baseSalary: z.coerce.number().int().nonnegative().optional(),
  deductions: z.coerce.number().int().nonnegative().optional(),
  bonuses: z.coerce.number().int().nonnegative().optional(),
  status: z.enum(["PENDING", "PROCESSING", "PAID", "FAILED"]).optional(),
  paymentDate: z.string().optional().nullable(),
  paymentRef: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(2).max(160),
  message: z.string().trim().min(2),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  publishDate: z.string().optional(),
  active: z.boolean().optional(),
});

export const kycPersonalSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["FEMALE", "MALE", "NON_BINARY", "PREFER_NOT_TO_SAY"]).optional(),
  phone: z.string().trim().min(8).max(20).optional(),
  address: z.string().trim().min(3).max(500).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  state: z.string().trim().min(2).max(80).optional(),
  pinCode: z.string().trim().regex(/^\d{6}$/, "PIN code must be 6 digits").optional(),
  emergencyName: z.string().trim().min(2).max(120).optional(),
  emergencyPhone: z.string().trim().min(8).max(20).optional(),
});

export const kycIdentitySchema = z.object({
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN must look like ABCDE1234F")
    .optional(),
  govIdType: z.enum(["AADHAAR", "PASSPORT", "DRIVING_LICENSE", "VOTER_ID", "OTHER"]).optional(),
  govIdNumber: z.string().trim().min(4).max(20).optional(),
});
