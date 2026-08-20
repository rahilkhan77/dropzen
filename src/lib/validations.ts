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

export const employeeCreateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  username: z.string().trim().min(3).max(40).regex(/^[a-z0-9._-]+$/i, "Use letters, numbers, dots, or dashes"),
  password: passwordSchema,
  phone: z.string().trim().optional(),
  department: z.string().trim().min(1),
  designation: z.string().trim().min(1),
  joiningDate: z.string().min(1),
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
  ifsc: z.string().trim().min(4).max(15),
  upiId: z.string().trim().max(80).optional(),
  pan: z.string().trim().max(12).optional(),
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
  dateKey: z.string().min(1),
  deadline: z.string().min(1),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  estimatedHours: z.string().optional(),
  notes: z.string().optional(),
  employeeIds: z.array(z.string()).min(1, "Assign at least one employee"),
  recurring: z.boolean().optional(),
});
