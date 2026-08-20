import type { KycStatus, Role } from "@prisma/client";

export type AuthContext = {
  sessionId: string;
  userId: string;
  role: Role;
  email: string;
  employeeId: string | null;
  employeeCode: string | null;
  name: string;
  kycStatus: KycStatus | null;
};
