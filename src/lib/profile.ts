import { parseJson } from "@/lib/utils";

export function profileCompletion(employee: EmployeeLike) {
  const checks = [
    Boolean(employee.fullName),
    Boolean(employee.photoFileId),
    Boolean(employee.user?.email),
    Boolean(employee.phone),
    Boolean(employee.dateOfBirth),
    Boolean(employee.address),
    Boolean(employee.emergencyName),
    Boolean(employee.emergencyPhone),
    Boolean(employee.joiningDate),
    Boolean(employee.employeeCode),
    Boolean(employee.department),
    Boolean(employee.designation),
    parseJson<string[]>(employee.skills, []).length > 0,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

export type EmployeeLike = {
  fullName: string;
  photoFileId?: string | null;
  phone?: string | null;
  dateOfBirth?: string | Date | null;
  address?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  joiningDate?: string | Date | null;
  employeeCode?: string | null;
  department?: string | null;
  designation?: string | null;
  skills?: string | null;
  user?: { email?: string };
};
