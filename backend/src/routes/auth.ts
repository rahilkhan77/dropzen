import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { asyncHandler } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { ok } from "../utils/response.js";
import { field, param } from "../utils/form.js";
import { loginSchema, changePasswordSchema, resetPasswordSchema, passwordSchema, activateSchema } from "../validators/index.js";
import * as auth from "../services/auth.js";
import * as invitation from "../services/invitation.js";
import { errors } from "../utils/errors.js";
import { getSettings } from "../services/settings.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: async () => {
    try {
      const settings = await getSettings();
      return env.NODE_ENV === "production" ? settings.loginRateLimit : 400;
    } catch {
      return env.NODE_ENV === "production" ? 10 : 400;
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Please wait and try again.", code: "RATE_LIMITED" },
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please wait and try again.", code: "RATE_LIMITED" },
});

authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.parse({
      identifier: field(req, "identifier"),
      password: field(req, "password"),
    });
    const { token, user } = await auth.login(req, parsed.identifier, parsed.password);
    res.cookie(env.COOKIE_NAME, token, auth.cookieOptions());
    const redirectTo = user.mustChangePassword
      ? "/change-password"
      : user.role === "EMPLOYEE" && user.kycStatus !== "APPROVED"
        ? "/employee/kyc"
        : "/dashboard";
    return ok(res, { user, redirectTo }, "Signed in");
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await auth.logout(req);
    res.clearCookie(env.COOKIE_NAME, { path: "/" });
    return ok(res, { redirectTo: "/login" }, "Signed out");
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    return ok(res, await auth.me(req.auth!.userId));
  }),
);

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = changePasswordSchema.parse({
      currentPassword: field(req, "currentPassword"),
      newPassword: field(req, "newPassword"),
      confirmPassword: field(req, "confirmPassword"),
    });
    await auth.changePassword(req.auth!.userId, parsed.currentPassword, parsed.newPassword, req.ip);
    res.clearCookie(env.COOKIE_NAME, { path: "/" });
    return ok(res, { redirectTo: "/login" }, "Password updated. Please sign in again.");
  }),
);

authRouter.post(
  "/forgot-password",
  forgotLimiter,
  asyncHandler(async (req, res) => {
    const identifier = field(req, "identifier");
    if (!identifier) throw errors.validation("Enter your email or username");
    const result = await auth.forgotPassword(identifier, req.ip);
    return ok(
      res,
      { resetUrl: result.resetUrl },
      "If an account exists, a reset link has been sent.",
    );
  }),
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const parsed = resetPasswordSchema.parse({
      token: field(req, "token"),
      password: field(req, "password"),
      confirmPassword: field(req, "confirmPassword"),
    });
    passwordSchema.parse(parsed.password);
    await auth.resetPassword(parsed.token, parsed.password);
    return ok(res, undefined, "Password reset. You can sign in now.");
  }),
);

authRouter.get(
  "/invite/:token",
  asyncHandler(async (req, res) => {
    return ok(res, await invitation.peekInvitation(param(req, "token")));
  }),
);

authRouter.post(
  "/activate",
  asyncHandler(async (req, res) => {
    const parsed = activateSchema.parse({
      token: field(req, "token"),
      password: field(req, "password"),
      confirmPassword: field(req, "confirmPassword"),
    });
    await auth.assertPasswordPolicy(parsed.password);
    const result = await invitation.activateInvitation(req, parsed.token, parsed.password);
    res.cookie(env.COOKIE_NAME, result.sessionToken, auth.cookieOptions());
    return ok(res, { redirectTo: result.redirectTo }, "Account activated");
  }),
);
