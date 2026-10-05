import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Outside Replit (e.g. Render) one server serves the web app, the dictionary
// admin and the API. Paths are relative to the built bundle in dist/.
const artifactsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function mountSpa(app: Express, mountPath: string, distPath: string) {
  if (!fs.existsSync(path.join(distPath, "index.html"))) return false;
  app.use(mountPath, express.static(distPath, { index: false }));
  app.get(`${mountPath === "/" ? "" : mountPath}/{*path}`, (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path === "/api") return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
  return true;
}

export function serveStatic(app: Express): string[] {
  const mounted: string[] = [];
  if (
    mountSpa(
      app,
      "/dictionary-admin",
      path.join(artifactsDir, "dictionary-admin/dist/public"),
    )
  ) {
    mounted.push("/dictionary-admin");
  }
  if (mountSpa(app, "/", path.join(artifactsDir, "trampoline/dist/public"))) {
    mounted.push("/");
  }
  return mounted;
}
