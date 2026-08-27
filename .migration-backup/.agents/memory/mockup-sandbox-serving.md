---
name: Mockup sandbox serving
description: Why canvas mockup iframes show the main app or a vite overlay, and how to repair serving.
---

**Rule:** If a `/__mockup/...` canvas frame shows the main app's splash/login instead of a mockup, the sandbox isn't serving — check that `artifacts/mockup-sandbox/` is fully scaffolded (package.json, vite.config.ts, index.html — not just `src/`) and that its deps are installed (`vite: command not found` in the preview workflow log = never ran npm install). A design subagent can write components and mark frames live without the sandbox existing; unserved `/__mockup` paths fall through to the main app on port 5000.

**Why:** A design-variant subagent shipped a "live" frame while `artifacts/mockup-sandbox/` contained only `src/` — no scaffold, no workflow. Recovery: back up `src/components/mockups/`, `rm -rf` the dir (createArtifact refuses to scaffold over it), re-run `createArtifact`, restore components, `npm install` in the sandbox dir, restart the preview workflow.

**Cartographer trap:** The sandbox's cartographer plugin walks up and dynamically imports the MAIN app's `tailwind.config.ts`, so that config's `require()` plugins (tailwindcss-animate, @tailwindcss/typography) must resolve from ROOT node_modules. A pruned root tree (scaffolding/npm sync can drop packages declared in package.json) causes a persistent vite error overlay over every mockup. Fix at root with plain `npm install` — installing the plugins inside the sandbox does NOT help (vite resolves from the importer's path).

**How to apply:** Broken mockup frame → check preview workflow log first, then curl `$REPLIT_DEV_DOMAIN/__mockup/...` (sandbox HTML vs "Trampoline Note" title), then screenshot on the sandbox's own port with the `/__mockup/`-prefixed path (unprefixed paths hit vite's base-URL notice page).
