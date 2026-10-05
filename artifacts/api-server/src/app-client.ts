// Support for the iOS app (artifacts/ios-app). The app ships the web UI on
// the device and calls this API from the `capacitor://localhost` origin.
// iOS blocks cross-site cookies there, so the app authenticates with its
// session cookie value sent as a bearer token instead; everything behind
// express-session then works unchanged.

import crypto from "crypto";
import type { Request, RequestHandler } from "express";

const SESSION_COOKIE = "connect.sid";
export const APP_ORIGIN = "capacitor://localhost";

export function isAppRequest(req: Request): boolean {
  return req.get("origin") === APP_ORIGIN;
}

/** CORS for the iOS app's origin only; the web app stays same-origin. */
export const appCors: RequestHandler = (req, res, next) => {
  if (!isAppRequest(req)) return next();
  res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Expose-Headers", "X-Total-Count");
  res.vary("Origin");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.get("access-control-request-headers") || "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Max-Age", "600");
    return res.status(204).end();
  }
  next();
};

/**
 * Turns `Authorization: Bearer <token>` into the session cookie so
 * express-session picks it up. Must run before the session middleware.
 * The WHOOP sign-in page is opened by navigation (no headers), so it also
 * accepts the token as `?app_token=` on that one route.
 */
export const appSessionToken: RequestHandler = (req, _res, next) => {
  let token: string | undefined;
  const auth = req.get("authorization");
  if (auth?.startsWith("Bearer ")) token = auth.slice(7).trim();
  else if (req.method === "GET" && req.path === "/api/whoop/auth" && typeof req.query.app_token === "string") {
    token = req.query.app_token;
  }
  if (token) req.headers.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
  next();
};

/** The signed session cookie value (what express-session would set). */
export function sessionTokenFor(req: Request): string {
  const sig = crypto
    .createHmac("sha256", process.env.SESSION_SECRET!)
    .update(req.sessionID)
    .digest("base64")
    .replace(/=+$/, "");
  return `s:${req.sessionID}.${sig}`;
}
