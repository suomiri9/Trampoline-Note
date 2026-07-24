import session from "express-session";
import type { Express, Request, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { storage } from "./storage";
import { sendPasswordResetEmail } from "./email";

declare module "express-session" {
  interface SessionData {
    userId: string;
    // CSRF state for the in-flight "Sign in with WHOOP" OAuth redirect.
    whoopOauthState?: { value: string; expiresAt: number };
  }
}

const cookieOptions: session.CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function getSession() {
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: cookieOptions.maxAge!,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: cookieOptions,
  });
}

function setSessionUser(req: Request, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.userId = userId;
    req.session.save((err: Error | null) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  displayName: z.string().min(1, "Display name is required").optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetPasswordSchema = z.object({
  token: z
    .string()
    .min(20)
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid reset token"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 60 minutes

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Base URL for emailed reset links. Prefer an explicit configured origin so a
// forged Host/Origin header can never poison the link; fall back to the
// request origin (fine for dev / single-domain deploys).
export function getBaseUrl(req: Request): string {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  // Prefer the platform-provided canonical domain over the request Host header
  // so a spoofed Host can't poison the reset link sent to a victim's inbox.
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  return `${req.protocol}://${req.get("host")}`;
}

// Minimal in-memory rate limiter (per-process). Keeps a brute-forcer from
// hammering the reset endpoints without pulling in a dependency.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

const DEMO_USER_ID = "55504735";
const DEMO_EMAIL = "suomi.ri.9@gmail.com";
const DEMO_PASSWORD = "tramplog2026";

async function seedDemoUser() {
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [existing] = await db.select().from(users).where(eq(users.id, DEMO_USER_ID));
  if (existing) {
    if (!existing.password) {
      await db
        .update(users)
        .set({
          password: hashedPassword,
          displayName: existing.displayName || existing.firstName || "Demo User",
          email: DEMO_EMAIL,
          updatedAt: new Date(),
        })
        .where(eq(users.id, DEMO_USER_ID));
      console.log("Seeded demo user with password");
    }
  } else {
    await db.insert(users).values({
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      password: hashedPassword,
      displayName: "Demo User",
    });
    console.log("Created demo user");
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  await seedDemoUser();

  app.post("/api/auth/register", async (req, res) => {
    try {
      const input = registerSchema.parse(req.body);
      const normalizedEmail = input.email.trim().toLowerCase();

      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail));

      if (existing) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);

      const [user] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          password: hashedPassword,
          displayName: input.displayName || normalizedEmail.split("@")[0],
        })
        .returning();

      await setSessionUser(req, user.id);
      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Registration error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const input = loginSchema.parse(req.body);
      const normalizedEmail = input.email.trim().toLowerCase();

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail));

      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      await setSessionUser(req, user.id);
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Login error:", err);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (!user) {
        req.session.destroy(() => {});
        res.clearCookie("connect.sid", { httpOnly: true, secure: true, sameSite: "lax" });
        return res.status(401).json({ message: "Unauthorized" });
      }

      await storage.claimLegacyData(userId);

      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid", { httpOnly: true, secure: true, sameSite: "lax" });
      res.json({ message: "Logged out" });
    });
  });

  // Generic response used for ALL forgot-password outcomes so an attacker can't
  // tell whether an email is registered.
  const FORGOT_GENERIC = {
    message: "If an account exists for that email, a reset link has been sent.",
  };

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const input = forgotPasswordSchema.parse(req.body);
      const normalizedEmail = input.email.trim().toLowerCase();

      const ip = req.ip || "unknown";
      if (!rateLimit(`forgot:${ip}:${normalizedEmail}`, 5, 15 * 60 * 1000)) {
        // Still generic — don't reveal throttling tied a real account.
        return res.json(FORGOT_GENERIC);
      }

      const user = await storage.getUserByEmail(normalizedEmail);
      if (user) {
        const rawToken = crypto.randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await storage.createPasswordResetToken(user.id, sha256(rawToken), expiresAt);

        const resetUrl = `${getBaseUrl(req)}/reset-password?token=${rawToken}`;
        try {
          await sendPasswordResetEmail({
            to: normalizedEmail,
            resetUrl,
            displayName: user.displayName,
          });
        } catch (sendErr) {
          // Never leak send failures to the client.
          console.error("Failed to send password reset email:", sendErr);
        }
      }

      return res.json(FORGOT_GENERIC);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Forgot-password error:", err);
      // Stay generic even on unexpected errors.
      return res.json(FORGOT_GENERIC);
    }
  });

  app.get("/api/auth/reset-password/validate", async (req, res) => {
    try {
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
        return res.json({ valid: false });
      }
      const record = await storage.getValidResetTokenByHash(sha256(token));
      return res.json({ valid: !!record });
    } catch (err) {
      console.error("Validate-reset-token error:", err);
      return res.json({ valid: false });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const ip = req.ip || "unknown";
      if (!rateLimit(`reset:${ip}`, 10, 15 * 60 * 1000)) {
        return res.status(429).json({ message: "Too many attempts. Try again later." });
      }

      const input = resetPasswordSchema.parse(req.body);
      const record = await storage.getValidResetTokenByHash(sha256(input.token));
      if (!record) {
        return res
          .status(400)
          .json({ message: "This reset link is invalid or has expired." });
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);
      const ok = await storage.completePasswordReset(
        record.userId,
        record.id,
        hashedPassword,
      );
      if (!ok) {
        // Lost a concurrent race (token consumed between precheck and commit).
        return res
          .status(400)
          .json({ message: "This reset link is invalid or has expired." });
      }

      return res.json({ message: "Password updated. You can now sign in." });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Reset-password error:", err);
      return res.status(500).json({ message: "Could not reset password" });
    }
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.session.userId) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

export function getUserId(req: Request): string {
  return req.session.userId!;
}
