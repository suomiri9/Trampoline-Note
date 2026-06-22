// Password-reset email delivery via the Resend integration.
//
// Uses the Replit Resend connector through @replit/connectors-sdk, which
// handles identity, token refresh, and auth headers automatically. In
// non-production environments the reset link is also logged to the server
// console so the flow stays easy to test locally.

import { ReplitConnectors } from "@replit/connectors-sdk";

interface PasswordResetEmailParams {
  to: string;
  resetUrl: string;
  displayName?: string | null;
}

const FROM_ADDRESS = process.env.RESET_EMAIL_FROM || "onboarding@resend.dev";
const APP_NAME = "Trampoline Note";

// The SDK fetches fresh auth per request, so a single instance is safe to reuse.
const connectors = new ReplitConnectors();

function resetEmailHtml(resetUrl: string, displayName?: string | null): string {
  const greeting = displayName ? `Hi ${displayName},` : "Hi,";
  return `
  <div style="background:#0a0b10;padding:32px 16px;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#12141c;border:1px solid #23262f;border-radius:16px;padding:32px;color:#e7e9ee;">
      <div style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#6b86ff;margin-bottom:8px;">// ${APP_NAME}</div>
      <h1 style="font-size:24px;margin:0 0 16px;color:#ffffff;">Reset your password</h1>
      <p style="font-size:15px;line-height:1.6;color:#aab0bd;margin:0 0 16px;">${greeting}</p>
      <p style="font-size:15px;line-height:1.6;color:#aab0bd;margin:0 0 24px;">We received a request to reset your password. Click the button below to choose a new one. This link expires in 60 minutes.</p>
      <a href="${resetUrl}" style="display:inline-block;background:#3b6bff;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:12px;font-size:15px;">Reset password</a>
      <p style="font-size:13px;line-height:1.6;color:#7c8290;margin:24px 0 0;">If the button doesn't work, paste this link into your browser:</p>
      <p style="font-size:12px;line-height:1.6;color:#6b86ff;word-break:break-all;margin:4px 0 0;font-family:'JetBrains Mono',monospace;">${resetUrl}</p>
      <p style="font-size:13px;line-height:1.6;color:#7c8290;margin:24px 0 0;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>
  </div>`;
}

function resetEmailText(resetUrl: string, displayName?: string | null): string {
  const greeting = displayName ? `Hi ${displayName},` : "Hi,";
  return `${greeting}

We received a request to reset your ${APP_NAME} password.

Reset it here (expires in 60 minutes):
${resetUrl}

If you didn't request this, you can safely ignore this email — your password won't change.`;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
  displayName,
}: PasswordResetEmailParams): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    // Dev aid: keep the link visible in logs for local testing.
    console.log(`[email] Password reset link for ${to}: ${resetUrl}`);
  }

  // Resend integration: send through the connectors proxy.
  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    body: {
      from: FROM_ADDRESS,
      to: [to],
      subject: `Reset your ${APP_NAME} password`,
      html: resetEmailHtml(resetUrl, displayName),
      text: resetEmailText(resetUrl, displayName),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend send failed (${response.status}): ${detail}`);
  }
}
