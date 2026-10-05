import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes/routes";
import { appCors, isAppRequest } from "./app-client";
import { serveStatic } from "./static";
import { ensureFileStore } from "./file-store";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(appCors);
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (isAppRequest(req)) return next();
  const origin = req.get("origin");
  if (!origin) return next();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const expectedHost = forwardedHost || req.get("host");
  try {
    if (expectedHost && new URL(origin).host === expectedHost) return next();
  } catch {
    // Invalid origins are rejected below.
  }
  res.status(403).json({ message: "Cross-origin request rejected" });
});
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export async function initializeApp(): Promise<Express> {
  await ensureFileStore();
  await setupAuth(app);
  registerRoutes(app);
  if (process.env["SERVE_STATIC"] === "true") {
    logger.info({ mounted: serveStatic(app) }, "Serving web app builds");
  }
  return app;
}
