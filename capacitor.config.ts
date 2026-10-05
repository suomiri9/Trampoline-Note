import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.suomiri9.trampolinenote",
  appName: "Trampoline Note",
  // Vite builds the client into dist/public (see vite.config.ts).
  webDir: "dist/public",
  ios: {
    contentInset: "never",
    backgroundColor: "#2563eb",
  },
  plugins: {
    // Route fetch() through iOS networking so API calls to the hosted server
    // are not blocked by CORS and the session cookie is stored natively.
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
  },
};

export default config;
