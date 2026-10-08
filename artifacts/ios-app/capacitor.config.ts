import type { CapacitorConfig } from "@capacitor/cli";

// The iOS app ships the web app's screens (artifacts/trampoline) on the
// device and talks to the API on Render directly (not trampolinenote.com). See
// artifacts/trampoline/src/lib/native-app.ts for how requests are routed.
const config: CapacitorConfig = {
  appId: "com.suomiri9.trampolinenote",
  appName: "Trampoline Note",
  webDir: "../trampoline/dist/public",
  server: {
    // Keep WHOOP sign-in inside the app: it runs on the Render address and
    // WHOOP's login page, then returns to the app. Other links open Safari.
    allowNavigation: ["trampoline-note.onrender.com", "*.whoop.com"],
  },
  // Lets the server tell requests come from the iOS app.
  appendUserAgent: "TrampolineNoteiOS",
  ios: {
    // The web app already pads for the notch and home indicator.
    contentInset: "never",
    backgroundColor: "#2563eb",
  },
};

export default config;
