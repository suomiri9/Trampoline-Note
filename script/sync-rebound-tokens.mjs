/**
 * Sync the Rebound design system's token variables into the main app.
 *
 * Source of truth: artifacts/rebound/tokens.json → (pnpm tokens inside that
 * artifact) → artifacts/rebound/src/index.css. That generated file is Tailwind
 * v4 CSS, which the main app (Tailwind v3) cannot import wholesale — but its
 * first `:root { ... }` and `.dark { ... }` variable blocks are plain CSS with
 * the same HSL-triplet convention tailwind.config.ts already maps. This script
 * extracts exactly those two blocks into client/src/rebound-tokens.css.
 *
 * (Rebound was extracted FROM this app, so a resync only changes values if
 * artifacts/rebound/tokens.json is deliberately edited.)
 *
 * Run after any tokens.json change: `node script/sync-rebound-tokens.mjs`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "artifacts/rebound/src/index.css");
const target = resolve(root, "client/src/rebound-tokens.css");

const css = readFileSync(source, "utf8");

/** Extract a flat top-level block like `:root {\n ... \n}` (no nested braces).
 * Matches the FIRST such block — the token block, not the language layer's
 * later `:root` additions (the app defines those utilities itself). */
function extractBlock(selector) {
  const re = new RegExp(`^${selector.replace(".", "\\.")} \\{\\n([\\s\\S]*?)^\\}`, "m");
  const m = css.match(re);
  if (!m) throw new Error(`Could not find top-level "${selector}" block in ${source}`);
  return m[1];
}

function transform(body) {
  return (
    body
      // The v3 config maps card/popover borders as hsl(var(--card-border)), so
      // the var must hold a raw triplet, not an already-wrapped hsl() color.
      .replace(/--card-border: hsl\(var\(--card\)\);/g, "--card-border: var(--card);")
      .replace(/--popover-border: hsl\(var\(--popover\)\);/g, "--popover-border: var(--popover);")
  );
}

const light = transform(extractBlock(":root"));
const dark = transform(extractBlock(".dark"));

const out = `/* GENERATED FROM artifacts/rebound (Rebound design system) — DO NOT EDIT.
 * Edit artifacts/rebound/tokens.json, run \`pnpm tokens\` in artifacts/rebound,
 * then re-run \`node script/sync-rebound-tokens.mjs\` from the repo root.
 * Imported by client/src/main.tsx after index.css. */

:root {
${light}}

.dark {
${dark}}
`;

writeFileSync(target, out);
console.log(`Wrote ${target} (${out.length} bytes)`);
