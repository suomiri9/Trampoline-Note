import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

window.addEventListener("error", (e) => {
  console.error("[window.error]", {
    message: e.message,
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
    errorType: typeof e.error,
    errorString: String(e.error),
    errorJson: (() => { try { return JSON.stringify(e.error); } catch { return "[unserializable]"; } })(),
    stack: (e.error as any)?.stack,
  });
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandledrejection]", {
    reasonType: typeof e.reason,
    reasonString: String(e.reason),
    reasonJson: (() => { try { return JSON.stringify(e.reason); } catch { return "[unserializable]"; } })(),
    stack: (e.reason as any)?.stack,
  });
});

createRoot(document.getElementById("root")!).render(<App />);
