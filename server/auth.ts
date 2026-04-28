import session from "express-session";
import type { Express, Request, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { storage } from "./storage";

declare module "express-session" {
  interface SessionData {
    userId: string;
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
