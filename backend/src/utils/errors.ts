export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const errors = {
  validation: (message: string) => new ApiError(400, message, "VALIDATION_ERROR"),
  unauthorized: (message = "Authentication required") => new ApiError(401, message, "UNAUTHORIZED"),
  forbidden: (message = "You do not have access to this resource") => new ApiError(403, message, "FORBIDDEN"),
  kycRequired: (
    message = "Employee verification is required before accessing this resource.",
  ) => new ApiError(403, message, "KYC_REQUIRED"),
  notFound: (message = "Not found") => new ApiError(404, message, "NOT_FOUND"),
  conflict: (message: string) => new ApiError(409, message, "CONFLICT"),
  tooMany: (message = "Too many requests") => new ApiError(429, message, "RATE_LIMITED"),
  locked: (message: string) => new ApiError(423, message, "ACCOUNT_LOCKED"),
};
