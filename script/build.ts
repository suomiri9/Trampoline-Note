import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, readdir, writeFile } from "fs/promises";

// The service worker precaches every built asset so ALL pages work offline.
// Route chunks are lazy-loaded — without this, a page never visited while
// online showed "This page isn't available offline yet" even though the
// Settings download card said 100%.
async function injectOfflineManifest() {
  const files = await readdir("dist/public/assets");
  const urls = files.sort().map((f) => `/assets/${f}`);
  if (!urls.some((u) => /^\/assets\/index-[^/]+\.js$/.test(u))) {
    throw new Error("offline manifest: built entry chunk not found in dist/public/assets");
  }
  // The manifest itself is precached too, so the Settings download check can
  // verify completeness while offline.
  const withManifest = [...urls, "/offline-manifest.json"];
  await writeFile(
    "dist/public/offline-manifest.json",
    JSON.stringify({ urls: withManifest }),
  );
  const swPath = "dist/public/sw.js";
  const sw = await readFile(swPath, "utf-8");
  const placeholder = "const BUILD_ASSETS = [];";
  if (!sw.includes(placeholder)) {
    throw new Error(`offline manifest: BUILD_ASSETS placeholder not found in ${swPath}`);
  }
  await writeFile(
    swPath,
    sw.replace(placeholder, `const BUILD_ASSETS = ${JSON.stringify(withManifest)};`),
  );
  console.log(`offline manifest: ${withManifest.length} assets injected into sw.js`);
}

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "bcryptjs",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("generating offline asset manifest...");
  await injectOfflineManifest();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
