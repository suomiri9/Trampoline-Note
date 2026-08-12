// Rebuilds /tmp/pw-ldpath (LD_LIBRARY_PATH for the Playwright headless shell)
// after a container recycle. See .agents/memory/local-headless-e2e.md.
// Run: node e2e/build-ldpath.mjs   (needs /tmp/store-list.txt: `ls /nix/store > /tmp/store-list.txt`)
import { readFileSync, writeFileSync, existsSync, openSync, readSync, closeSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SHELL = readdirSync("/home/runner/workspace/.cache/ms-playwright")
  .filter(d => d.startsWith("chromium_headless_shell"))
  .map(d => `/home/runner/workspace/.cache/ms-playwright/${d}/chrome-headless-shell-linux64/chrome-headless-shell`)
  .find(existsSync);
if (!SHELL) throw new Error("headless shell binary not found");

const store = readFileSync("/tmp/store-list.txt", "utf8").split("\n").filter(Boolean);

// soname prefix -> nix package name regex (matched against store dir name)
const PKG = [
  [/^lib(glib|gobject|gio|gmodule|gthread)-2\.0/, /-glib-[\d.]+$/],
  [/^libnspr4|^libplc4|^libplds4/, /-nspr-[\d.]+$/],
  [/^libnss|^libsmime|^libssl3|^libsoftokn|^libfreebl/, /-nss-[\d.]+$/],
  [/^libdbus/, /-dbus-[\d.]+(-lib)?$/],
  [/^libatk-bridge|^libatspi/, /-at-spi2-(atk|core)-[\d.]+$/],
  [/^libatk/, /-atk-[\d.]+$/],
  [/^libgbm|^libEGL|^libGL/, /-mesa-[\d.]+$/],
  [/^libdrm/, /-libdrm-[\d.]+$/],
  [/^libasound/, /-alsa-lib-[\d.]+$/],
  [/^libexpat/, /-expat-[\d.]+$/],
  [/^libffi/, /-libffi-[\d.]+$/],
  [/^libpcre2/, /-pcre2-[\d.]+$/],
  [/^libxkbcommon/, /-libxkbcommon-[\d.]+$/],
  [/^libxcb/, /-libxcb-[\d.]+$/],
  [/^libX(au)/i, /-libxau-[\d.]+$/i],
  [/^libXdmcp/i, /-libxdmcp-[\d.]+$/i],
  [/^libX11/, /-libx11-[\d.]+$/i],
  [/^libXext/, /-libxext-[\d.]+$/i],
  [/^libXcomposite/, /-libxcomposite-[\d.]+$/i],
  [/^libXdamage/, /-libxdamage-[\d.]+$/i],
  [/^libXfixes/, /-libxfixes-[\d.]+$/i],
  [/^libXrandr/, /-libxrandr-[\d.]+$/i],
  [/^libXrender/, /-libxrender-[\d.]+$/i],
  [/^libXtst/, /-libxtst-[\d.]+$/i],
  [/^libXi\./, /-libxi-[\d.]+$/i],
  [/^libudev/, /-systemd-(minimal-)?(libs-)?[\d.]+/],
  [/^libz\.so/, /-zlib-[\d.]+$/],
];

function isX64(path) {
  try {
    const fd = openSync(path, "r");
    const buf = Buffer.alloc(20);
    readSync(fd, buf, 0, 20, 0);
    closeSync(fd);
    return buf.readUInt16LE(18) === 0x3e; // EM_X86_64
  } catch { return false; }
}

const dirs = new Set();
function resolve(soname) {
  const rule = PKG.find(([so]) => so.test(soname));
  if (!rule) return false;
  const candidates = store.filter(d => rule[1].test(d));
  for (const c of candidates) {
    const lib = `/nix/store/${c}/lib/${soname}`;
    if (existsSync(lib) && isX64(lib)) { dirs.add(`/nix/store/${c}/lib`); return true; }
  }
  return false;
}

for (let round = 0; round < 6; round++) {
  let out = "";
  try {
    out = execFileSync("ldd", [SHELL], {
      env: { ...process.env, LD_LIBRARY_PATH: [...dirs].join(":") },
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) { out = (e.stdout || "") + (e.stderr || ""); }
  const missing = [...out.matchAll(/^\s*(\S+)\s+=>\s+not found/gm)].map(m => m[1]);
  if (!missing.length) {
    const joined = [...dirs].join(":");
    writeFileSync("/tmp/pw-ldpath", joined);
    console.log("OK — all libs resolved.", dirs.size, "dirs");
    process.exit(0);
  }
  console.log(`round ${round}: ${missing.length} missing → ${missing.join(", ")}`);
  const unresolved = missing.filter(so => !resolve(so));
  if (unresolved.length && round > 0) {
    console.error("UNRESOLVED:", unresolved.join(", "));
    process.exit(1);
  }
}
console.error("gave up after 6 rounds");
process.exit(1);
