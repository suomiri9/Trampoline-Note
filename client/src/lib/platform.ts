import { Capacitor } from "@capacitor/core";

/** True when running inside the iOS (Capacitor) app rather than a browser. */
export const isNativeApp = Capacitor.isNativePlatform();
