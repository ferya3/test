import "server-only";
import nodemailer from "nodemailer";
import { env } from "./env";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Outbound email. Two providers:
 *
 * - `console` (the default) prints the message to the server log. Nothing is
 *   sent anywhere, which is what you want in development — the reset link is
 *   right there in the terminal.
 * - `smtp` sends for real through whatever host you configure.
 *
 * Delivery failures are logged and swallowed by the callers that must not leak
 * whether an address exists; see requestPasswordReset.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (env.mailProvider === "smtp") {
    await sendViaSmtp(mail);
    return;
  }

  console.log(
    [
      "",
      "──────────────────────────────────────────────────────────────",
      `  EMAIL (not sent — MAIL_PROVIDER is "console")`,
      `  To:      ${mail.to}`,
      `  Subject: ${mail.subject}`,
      "──────────────────────────────────────────────────────────────",
      mail.text,
      "──────────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );
}

let transport: nodemailer.Transporter | undefined;

async function sendViaSmtp(mail: Mail): Promise<void> {
  if (!env.smtpHost) throw new Error("MAIL_PROVIDER=smtp requires SMTP_HOST");

  transport ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    // Port 465 is implicit TLS; everything else upgrades with STARTTLS.
    secure: env.smtpPort === 465,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined,
  });

  await transport.sendMail({
    from: env.mailFrom,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

export function passwordResetMail(to: string, displayName: string, link: string, minutes: number): Mail {
  const text = [
    `Hello ${displayName},`,
    "",
    "Someone asked to reset the password on your EscrowBridge account.",
    "Open this link to choose a new one:",
    "",
    link,
    "",
    `The link works once and expires in ${minutes} minutes.`,
    "",
    "If this was not you, ignore this email — your password has not changed.",
    "EscrowBridge will never ask you for your password or your recovery codes.",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#111">
      <p>Hello ${escapeHtml(displayName)},</p>
      <p>Someone asked to reset the password on your EscrowBridge account.</p>
      <p>
        <a href="${escapeHtml(link)}"
           style="display:inline-block;background:#10b981;color:#04231a;padding:10px 18px;
                  border-radius:8px;text-decoration:none;font-weight:600">
          Choose a new password
        </a>
      </p>
      <p style="color:#555;font-size:14px">
        The link works once and expires in ${minutes} minutes.<br />
        If the button does not work, paste this into your browser:<br />
        <span style="word-break:break-all">${escapeHtml(link)}</span>
      </p>
      <hr style="border:none;border-top:1px solid #ddd;margin:24px 0" />
      <p style="color:#555;font-size:13px">
        If this was not you, ignore this email — your password has not changed.
        EscrowBridge will never ask you for your password or your recovery codes.
      </p>
    </div>`;

  return { to, subject: "Reset your EscrowBridge password", text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
