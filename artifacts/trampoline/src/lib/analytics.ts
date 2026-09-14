/**
 * Replit injects the Umami tracker into published HTML. The app deliberately
 * does not load or configure the tracker itself, so development and unpublished
 * builds safely become no-ops.
 */
export type AnalyticsEventData = {
  account_login_succeeded: undefined;
  account_registration_succeeded: undefined;
  training_session_saved: {
    session_type: "execution" | "tof" | "training";
    operation: "create" | "update";
  };
  training_session_queued: {
    session_type: "execution" | "tof" | "training";
    operation: "create" | "update";
  };
  training_session_save_failed: {
    session_type: "execution" | "tof" | "training";
    operation: "create" | "update";
  };
  skill_created: {
    kind: "skill" | "shape" | "drill" | "connection" | "routine_part";
  };
  routine_created: undefined;
  whoop_connect_clicked: {
    entrypoint: "dashboard";
  };
  whoop_connect_callback: {
    outcome: "connected" | "denied" | "state_mismatch" | "link_failed" | "not_configured";
  };
};

export type AnalyticsEventName = keyof AnalyticsEventData;
export type AnalyticsData = AnalyticsEventData[AnalyticsEventName];

type UmamiTrackResult = void | PromiseLike<void>;

declare global {
  interface Window {
    umami?: {
      track(name: AnalyticsEventName, data?: AnalyticsData): UmamiTrackResult;
    };
  }
}

/**
 * Send one of the app's typed, non-PII events without allowing analytics to
 * affect the user flow. Both synchronous tracker errors and rejected async
 * tracker calls are intentionally swallowed.
 */
export function trackEvent<Name extends AnalyticsEventName>(
  name: Name,
  ...args: AnalyticsEventData[Name] extends undefined
    ? [data?: undefined]
    : [data: AnalyticsEventData[Name]]
): void {
  if (typeof window === "undefined") return;

  try {
    const data = args[0];
    const result = window.umami?.track(name, data);
    if (
      result &&
      (typeof result === "object" || typeof result === "function") &&
      "then" in result
    ) {
      void Promise.resolve(result).catch(() => {
        // Analytics must never break the app.
      });
    }
  } catch {
    // Analytics must never break the app.
  }
}