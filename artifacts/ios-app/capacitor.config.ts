import type { CapacitorConfig } from "@capacitor/cli";

// The iOS app is a native shell around the live web app, so every feature
// (AI coach, WHOOP, dictionary, sign-in) works exactly as on the web and
// web deploys reach the app without an App Store update.
const APP_URL = "https://trampolinenote.com";

const config: CapacitorConfig = {
  appId: "com.suomiri9.trampolinenote",
  appName: "Trampoline Note",
  // Only the offline fallback page ships inside the app.
  webDir: "www",
  server: {
    url: APP_URL,
    // Shown when the site can't be reached (e.g. no internet).
    errorPath: "offline.html",
    // Keep WHOOP sign-in inside the app so the OAuth callback lands in the
    // same session. Other external links open in Safari.
    allowNavigation: ["*.whoop.com"],
  },
  // Lets the web app tell it is running inside the iOS app.
  appendUserAgent: "TrampolineNoteiOS",
  ios: {
    // The web app already pads for the notch and home indicator.
    contentInset: "never",
    backgroundColor: "#2563eb",
  },
};

export default config;
