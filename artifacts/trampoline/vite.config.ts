import { readFile, readdir, writeFile } from 'fs/promises';
import path from 'path';
import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

// Offline mode precaches every built file so ALL pages open with no
// connection. After a production build this writes /offline-manifest.json
// (read by Settings and the launch-time self-heal) and fills BUILD_ASSETS in
// sw.js. Route chunks are lazy-loaded, so without this a page never visited
// while online showed "This page isn't available offline yet".
function offlineManifest(): Plugin {
  let outDir = '';
  return {
    name: 'trampoline-offline-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = await readdir(path.join(outDir, 'assets'));
      const urls = files.sort().map((f) => `/assets/${f}`);
      if (!urls.some((u) => /^\/assets\/index-[^/]+\.js$/.test(u))) {
        throw new Error('offline manifest: built entry chunk not found in assets/');
      }
      // The manifest is precached too, so Settings can check the download
      // is complete while offline.
      const withManifest = [...urls, '/offline-manifest.json'];
      await writeFile(
        path.join(outDir, 'offline-manifest.json'),
        JSON.stringify({ urls: withManifest }),
      );
      const swPath = path.join(outDir, 'sw.js');
      const sw = await readFile(swPath, 'utf-8');
      const placeholder = 'const BUILD_ASSETS = [];';
      if (!sw.includes(placeholder)) {
        throw new Error(`offline manifest: BUILD_ASSETS placeholder not found in ${swPath}`);
      }
      await writeFile(
        swPath,
        sw.replace(placeholder, `const BUILD_ASSETS = ${JSON.stringify(withManifest)};`),
      );
    },
  };
}

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    runtimeErrorOverlay(),
    offlineManifest(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@shared': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'lib',
        'trampoline-shared',
        'src',
      ),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: false,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
