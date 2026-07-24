import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { pool } from "./db";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // Don't log WHOOP response bodies — they contain personal health data.
      if (capturedJsonResponse && !path.startsWith("/api/whoop")) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password varchar;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name varchar;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS focus_memo text;
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS sort_order integer;
      ALTER TABLE routines ADD COLUMN IF NOT EXISTS code text;
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS archived integer NOT NULL DEFAULT 0;
      ALTER TABLE routines ADD COLUMN IF NOT EXISTS archived integer NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS coach_messages (
        id serial PRIMARY KEY,
        user_id varchar NOT NULL,
        role text NOT NULL,
        content text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS whoop_tokens (
        user_id varchar PRIMARY KEY,
        access_token text NOT NULL,
        refresh_token text,
        expires_at timestamp NOT NULL,
        scope text,
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);
    console.log("Database migrations applied");
  } catch (err) {
    console.error("Migration error (non-fatal):", err);
  } finally {
    client.release();
  }
}

(async () => {
  await runMigrations();
  await setupAuth(app);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
