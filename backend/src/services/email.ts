import { env, isProd } from "../config/env.js";
import { getSettings } from "./settings.js";
import { log } from "../utils/log.js";

type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

async function transport() {
  if (!env.SMTP_HOST) return null;
  const nodemailer = await import("nodemailer");
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
}

function wrap(companyName: string, heading: string, body: string, cta?: { label: string; href: string }) {
  const button = cta
    ? `<p><a href="${cta.href}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${cta.label}</a></p>`
    : "";
  return {
    text: `${heading}\n\n${body}${cta ? `\n\n${cta.label}: ${cta.href}` : ""}\n\n— ${companyName}`,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px">${companyName}</h2>
      <h3 style="margin:0 0 12px">${heading}</h3>
      <p>${body.replaceAll("\n", "<br/>")}</p>
      ${button}
    </div>`,
  };
}

async function send(mail: Mail) {
  const settings = await getSettings();
  if (!settings.emailNotifications) {
    log("info", "email skipped (notifications disabled)", { to: mail.to, subject: mail.subject });
    return;
  }
  const from = env.SMTP_FROM || `${settings.companyName} <noreply@localhost>`;
  const smtp = await transport();
  if (!smtp) {
    log("info", "email:dev", { to: mail.to, subject: mail.subject, text: mail.text });
    return;
  }
  await smtp.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
  log("info", "email sent", { to: mail.to, subject: mail.subject, production: isProd });
}

export const EmailService = {
  async sendEmployeeInvitation(opts: { to: string; name: string; inviteUrl: string }) {
    const settings = await getSettings();
    const content = wrap(
      settings.companyName,
      "You're invited",
      `Hi ${opts.name},\n\nAn administrator created your ${settings.companyName} employee account. Set your password using the link below. This invitation expires and can be used only once.`,
      { label: "Activate account", href: opts.inviteUrl },
    );
    await send({ to: opts.to, subject: `Activate your ${settings.companyName} account`, ...content });
  },

  async sendPasswordReset(opts: { to: string; name: string; resetUrl: string }) {
    const settings = await getSettings();
    const content = wrap(
      settings.companyName,
      "Reset your password",
      `Hi ${opts.name},\n\nWe received a request to reset your ${settings.companyName} password. If you did not request this, you can ignore this email.`,
      { label: "Reset password", href: opts.resetUrl },
    );
    await send({ to: opts.to, subject: `${settings.companyName} password reset`, ...content });
  },

  async sendKycSubmitted(opts: { to: string; employeeName: string; reviewUrl: string }) {
    const settings = await getSettings();
    const content = wrap(
      settings.companyName,
      "Verification submitted",
      `${opts.employeeName} submitted employee verification and is waiting for review.`,
      { label: "Review submission", href: opts.reviewUrl },
    );
    await send({ to: opts.to, subject: `Verification submitted — ${opts.employeeName}`, ...content });
  },

  async sendKycApproved(opts: { to: string; name: string }) {
    const settings = await getSettings();
    const content = wrap(
      settings.companyName,
      "Verification approved",
      `Hi ${opts.name},\n\nYour employee verification was approved. Your ${settings.companyName} workspace is now fully available.`,
      { label: "Open dashboard", href: `${env.FRONTEND_URL}/dashboard` },
    );
    await send({ to: opts.to, subject: `Verification approved — ${settings.companyName}`, ...content });
  },

  async sendKycRejected(opts: { to: string; name: string; reason: string }) {
    const settings = await getSettings();
    const content = wrap(
      settings.companyName,
      "Verification needs updates",
      `Hi ${opts.name},\n\nYour verification needs updates:\n\n${opts.reason}`,
      { label: "Update verification", href: `${env.FRONTEND_URL}/employee/kyc` },
    );
    await send({ to: opts.to, subject: `Verification update required — ${settings.companyName}`, ...content });
  },

  async sendTaskAssigned(opts: { to: string; name: string; title: string; taskUrl: string }) {
    const settings = await getSettings();
    const content = wrap(
      settings.companyName,
      "New task assigned",
      `Hi ${opts.name},\n\nYou have been assigned: ${opts.title}`,
      { label: "Open task", href: opts.taskUrl },
    );
    await send({ to: opts.to, subject: `Task assigned: ${opts.title}`, ...content });
  },

  async sendTaskRevision(opts: { to: string; name: string; title: string; feedback: string; taskUrl: string }) {
    const settings = await getSettings();
    const content = wrap(
      settings.companyName,
      "Revision requested",
      `Hi ${opts.name},\n\nPlease revise "${opts.title}".\n\n${opts.feedback}`,
      { label: "Open task", href: opts.taskUrl },
    );
    await send({ to: opts.to, subject: `Revision requested: ${opts.title}`, ...content });
  },

  async sendSalaryPaid(opts: { to: string; name: string; month: number; year: number }) {
    const settings = await getSettings();
    const content = wrap(
      settings.companyName,
      "Salary marked as paid",
      `Hi ${opts.name},\n\nYour salary for ${opts.month}/${opts.year} has been marked as paid.`,
      { label: "View salary", href: `${env.FRONTEND_URL}/salary` },
    );
    await send({ to: opts.to, subject: `Salary paid — ${opts.month}/${opts.year}`, ...content });
  },
};
