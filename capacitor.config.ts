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
};

export default config;
