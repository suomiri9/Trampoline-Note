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

// The email adapts to the recipient's device light/dark setting via the
// `prefers-color-scheme` media query. The inline styles are the LIGHT baseline
// (the safe default for clients that don't support embedded <style> or the
// media query); the <style> block restores the dark monospace look when the
// device is in dark mode. `color-scheme`/`supported-color-schemes` tell mail
// clients we handle theming ourselves so they don't force their own inversion.
function resetEmailHtml(resetUrl: string, displayName?: string | null): string {
  const greeting = displayName ? `Hi ${displayName},` : "Hi,";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Reset your ${APP_NAME} password</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      .email-body { background:#050505 !important; }
      .email-card { background:#0d0d0d !important; border-color:#1f1f1f !important; color:#f4f6f6 !important; }
      .email-eyebrow { color:#7dd3fc !important; }
      .email-heading { color:#ffffff !important; }
      .email-text { color:#aab0bd !important; }
      .email-muted { color:#7c8290 !important; }
      .email-link { color:#7dd3fc !important; }
    }
  </style>
</head>
<body class="email-body" style="margin:0;padding:0;background:#f4f4f5;">
  <div class="email-body" style="background:#f4f4f5;padding:32px 16px;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div class="email-card" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e7ea;border-radius:16px;padding:32px;color:#2a2d35;">
      <div class="email-eyebrow" style="font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#0284c7;margin-bottom:8px;">// ${APP_NAME}</div>
      <h1 class="email-heading" style="font-size:24px;margin:0 0 16px;color:#050505;letter-spacing:-0.02em;">Reset your password</h1>
      <p class="email-text" style="font-size:15px;line-height:1.6;color:#51586a;margin:0 0 16px;">${greeting}</p>
      <p class="email-text" style="font-size:15px;line-height:1.6;color:#51586a;margin:0 0 24px;">We received a request to reset your password. Click the button below to choose a new one. This link expires in 60 minutes.</p>
      <a href="${resetUrl}" class="email-cta" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:12px;font-size:15px;">Reset password</a>
      <p class="email-muted" style="font-size:13px;line-height:1.6;color:#858b99;margin:24px 0 0;">If the button doesn't work, paste this link into your browser:</p>
      <p class="email-link" style="font-size:12px;line-height:1.6;color:#0284c7;word-break:break-all;margin:4px 0 0;font-family:'IBM Plex Mono',monospace;">${resetUrl}</p>
      <p class="email-muted" style="font-size:13px;line-height:1.6;color:#858b99;margin:24px 0 0;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>
  </div>
</body>
</html>`;
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
